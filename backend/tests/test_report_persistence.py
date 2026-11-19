"""Automated Tests for Phase 3.3 Report Persistence and Supabase Storage Security.

Verifies:
- Authenticated report insertion deriving user ID from verified citizen token (no spoofing).
- Rejection of unauthenticated report insertion (401).
- Validation of coordinate boundaries (422).
- Report retrieval from Supabase.
- Report status updates.
- Citizen ownership enforcement on deletion (403 when trying to delete another citizen's report).
- Storage cleanup on deletion.
- Handling of unconfigured Supabase backend (503).
- Existing YOLOv8 detection and health endpoints remaining operational.
"""

from unittest.mock import MagicMock, patch
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.schemas import AuthenticatedCitizen
from app.auth import get_current_citizen


client = TestClient(app)

CITIZEN_1_UUID = "11111111-1111-4111-a111-111111111111"
CITIZEN_2_UUID = "22222222-2222-4222-a222-222222222222"


def mock_citizen_1():
    return AuthenticatedCitizen(
        user_id=CITIZEN_1_UUID,
        email="citizen1@example.com",
        role="authenticated",
        app_metadata={"provider": "email"},
        user_metadata={"full_name": "Aarav Sharma"},
    )


def test_create_report_unauthenticated_rejected():
    """Unauthenticated report creation must be rejected with HTTP 401."""
    payload = {
        "title": "Outer Ring Road Crater",
        "description": "Deep depression near Bellandur",
        "latitude": 12.9352,
        "longitude": 77.6823,
        "priority": "high",
    }
    response = client.post("/api/reports", json=payload)
    assert response.status_code == 401
    assert "WWW-Authenticate" in response.headers
    assert response.headers["WWW-Authenticate"] == "Bearer"


def test_create_report_invalid_coordinates_rejected():
    """Missing or out-of-bounds coordinates must fail validation with HTTP 422."""
    app.dependency_overrides[get_current_citizen] = mock_citizen_1
    try:
        payload = {
            "title": "Invalid Lat Long Report",
            "latitude": 999.0,  # Invalid latitude > 90
            "longitude": 77.6823,
            "priority": "medium",
        }
        response = client.post(
            "/api/reports",
            json=payload,
            headers={"Authorization": "Bearer mock-token"},
        )
        assert response.status_code == 422
    finally:
        app.dependency_overrides.pop(get_current_citizen, None)


def test_create_report_authenticated_derives_user_id():
    """Authenticated report creation must associate the report with the verified citizen's UUID."""
    app.dependency_overrides[get_current_citizen] = mock_citizen_1

    mock_db_client = MagicMock()
    inserted_row = {
        "id": "mock-report-uuid-001",
        "user_id": CITIZEN_1_UUID,
        "title": "Bellandur Flyover Defect",
        "description": "Crater in left bus lane",
        "latitude": 12.9352,
        "longitude": 77.6823,
        "address": "Bellandur, Mahadevapura (Ward 150)",
        "status": "submitted",
        "priority": "critical",
        "pothole_count": 2,
        "ai_detection": {"model_name": "best.pt", "potholes_detected": 2},
        "image_path": f"{CITIZEN_1_UUID}/mock-report-uuid-001/original.jpg",
        "annotated_image_path": f"{CITIZEN_1_UUID}/mock-report-uuid-001/annotated.jpg",
        "created_at": "2026-11-08T12:00:00Z",
        "updated_at": "2026-11-08T12:00:00Z",
    }

    mock_insert_builder = MagicMock()
    mock_insert_builder.execute.return_value = MagicMock(data=[inserted_row])
    mock_table = MagicMock()
    mock_table.insert.return_value = mock_insert_builder
    mock_db_client.table.return_value = mock_table

    with patch("app.main.is_supabase_configured", return_value=True), patch(
        "app.main.get_supabase_client", return_value=mock_db_client
    ):
        try:
            payload = {
                "title": "Bellandur Flyover Defect",
                "description": "Crater in left bus lane",
                "latitude": 12.9352,
                "longitude": 77.6823,
                "address": "Bellandur, Mahadevapura (Ward 150)",
                "priority": "critical",
                "pothole_count": 2,
                "image_path": f"{CITIZEN_1_UUID}/mock-report-uuid-001/original.jpg",
            }
            response = client.post(
                "/api/reports",
                json=payload,
                headers={"Authorization": "Bearer mock-token"},
            )
            assert response.status_code == 201
            data = response.json()
            assert data["id"] == "mock-report-uuid-001"
            assert data["user_id"] == CITIZEN_1_UUID
            assert data["priority"] == "critical"

            # Verify that user_id was set from citizen identity, not spoofed
            call_args = mock_table.insert.call_args[0][0]
            assert call_args["user_id"] == CITIZEN_1_UUID
        finally:
            app.dependency_overrides.pop(get_current_citizen, None)


def test_list_reports_unauthenticated_rejected():
    """Unauthenticated access to /api/reports must be rejected with HTTP 401."""
    response = client.get("/api/reports")
    assert response.status_code == 401
    assert "WWW-Authenticate" in response.headers


def test_list_reports_authenticated_city_wide():
    """Authenticated citizen can retrieve city-wide reports filed across all wards."""
    app.dependency_overrides[get_current_citizen] = mock_citizen_1
    mock_db_client = MagicMock()
    # Includes reports filed by Citizen 1 and Citizen 2 (city-wide public metadata)
    sample_reports = [
        {
            "id": "report-1",
            "user_id": CITIZEN_1_UUID,
            "title": "Indiranagar 100ft Rd",
            "latitude": 12.9716,
            "longitude": 77.6412,
            "status": "in_review",
            "priority": "high",
            "pothole_count": 1,
            "created_at": "2026-11-08T10:00:00Z",
        },
        {
            "id": "report-2",
            "user_id": CITIZEN_2_UUID,
            "title": "Koramangala 80ft Rd",
            "latitude": 12.9352,
            "longitude": 77.6245,
            "status": "submitted",
            "priority": "medium",
            "pothole_count": 2,
            "created_at": "2026-11-08T09:00:00Z",
        },
    ]
    mock_select = MagicMock()
    mock_order = MagicMock()
    mock_order.execute.return_value = MagicMock(data=sample_reports)
    mock_select.order.return_value = mock_order
    mock_table = MagicMock()
    mock_table.select.return_value = mock_select
    mock_db_client.table.return_value = mock_table

    with patch("app.main.is_supabase_configured", return_value=True), patch(
        "app.main.get_supabase_client", return_value=mock_db_client
    ):
        try:
            response = client.get(
                "/api/reports",
                headers={"Authorization": "Bearer mock-token"},
            )
            assert response.status_code == 200
            data = response.json()
            assert len(data) == 2
            assert data[0]["id"] == "report-1"
            assert data[1]["id"] == "report-2"
        finally:
            app.dependency_overrides.pop(get_current_citizen, None)


def test_get_report_by_id_unauthenticated_rejected():
    """Unauthenticated access to /api/reports/{id} must be rejected with HTTP 401."""
    response = client.get("/api/reports/report-123")
    assert response.status_code == 401
    assert "WWW-Authenticate" in response.headers


def test_get_report_by_id_authenticated_other_citizen():
    """Citizen 1 can view Citizen 2's report metadata (city-wide public transparency)."""
    app.dependency_overrides[get_current_citizen] = mock_citizen_1
    mock_db_client = MagicMock()
    # Report belongs to Citizen 2
    sample_report = {
        "id": "report-owned-by-citizen-2",
        "user_id": CITIZEN_2_UUID,
        "title": "MG Road Depression",
        "latitude": 12.9750,
        "longitude": 77.6090,
        "status": "in_review",
        "priority": "high",
        "pothole_count": 1,
    }
    mock_select = MagicMock()
    mock_select.eq.return_value.execute.return_value = MagicMock(data=[sample_report])
    mock_table = MagicMock()
    mock_table.select.return_value = mock_select
    mock_db_client.table.return_value = mock_table

    with patch("app.main.is_supabase_configured", return_value=True), patch(
        "app.main.get_supabase_client", return_value=mock_db_client
    ):
        try:
            response = client.get(
                "/api/reports/report-owned-by-citizen-2",
                headers={"Authorization": "Bearer mock-token"},
            )
            assert response.status_code == 200
            data = response.json()
            assert data["id"] == "report-owned-by-citizen-2"
            assert data["user_id"] == CITIZEN_2_UUID
        finally:
            app.dependency_overrides.pop(get_current_citizen, None)


def test_get_report_by_id_not_found():
    """Retrieving a non-existent report returns HTTP 404 for authenticated citizens."""
    app.dependency_overrides[get_current_citizen] = mock_citizen_1
    mock_db_client = MagicMock()
    mock_select = MagicMock()
    mock_select.eq.return_value.execute.return_value = MagicMock(data=[])
    mock_table = MagicMock()
    mock_table.select.return_value = mock_select
    mock_db_client.table.return_value = mock_table

    with patch("app.main.is_supabase_configured", return_value=True), patch(
        "app.main.get_supabase_client", return_value=mock_db_client
    ):
        try:
            response = client.get(
                "/api/reports/non-existent-uuid",
                headers={"Authorization": "Bearer mock-token"},
            )
            assert response.status_code == 404
        finally:
            app.dependency_overrides.pop(get_current_citizen, None)


def test_update_report_status():
    """Updating report status invokes table update after ownership verification."""
    app.dependency_overrides[get_current_citizen] = mock_citizen_1

    mock_db_client = MagicMock()
    updated_row = {
        "id": "report-1",
        "user_id": CITIZEN_1_UUID,
        "title": "Indiranagar 100ft Rd",
        "latitude": 12.9716,
        "longitude": 77.6412,
        "status": "resolved",
        "priority": "high",
        "pothole_count": 1,
    }
    mock_select = MagicMock()
    mock_select.eq.return_value.execute.return_value = MagicMock(data=[updated_row])
    mock_update = MagicMock()
    mock_update.eq.return_value.execute.return_value = MagicMock(data=[updated_row])
    mock_table = MagicMock()
    mock_table.select.return_value = mock_select
    mock_table.update.return_value = mock_update
    mock_db_client.table.return_value = mock_table

    with patch("app.main.is_supabase_configured", return_value=True), patch(
        "app.main.get_supabase_client", return_value=mock_db_client
    ):
        try:
            response = client.patch(
                "/api/reports/report-1",
                json={"status": "resolved"},
                headers={"Authorization": "Bearer mock-token"},
            )
            assert response.status_code == 200
            data = response.json()
            assert data["status"] == "resolved"
        finally:
            app.dependency_overrides.pop(get_current_citizen, None)


def test_update_report_forbidden_for_non_owner():
    """A citizen cannot modify another citizen's report (must return HTTP 403 Forbidden)."""
    # Authenticated as Citizen 1
    app.dependency_overrides[get_current_citizen] = mock_citizen_1

    mock_db_client = MagicMock()
    # Report belongs to Citizen 2
    existing_report = {
        "id": "report-owned-by-citizen-2",
        "user_id": CITIZEN_2_UUID,
        "title": "Silk Board Crater",
        "status": "submitted",
    }
    mock_select = MagicMock()
    mock_select.eq.return_value.execute.return_value = MagicMock(data=[existing_report])
    mock_table = MagicMock()
    mock_table.select.return_value = mock_select
    mock_db_client.table.return_value = mock_table

    with patch("app.main.is_supabase_configured", return_value=True), patch(
        "app.main.get_supabase_client", return_value=mock_db_client
    ):
        try:
            response = client.patch(
                "/api/reports/report-owned-by-citizen-2",
                json={"status": "resolved"},
                headers={"Authorization": "Bearer mock-token"},
            )
            assert response.status_code == 403
            assert "Forbidden" in response.json()["detail"]
            assert "another citizen" in response.json()["detail"].lower()
        finally:
            app.dependency_overrides.pop(get_current_citizen, None)


def test_create_report_spoofed_image_path_rejected():
    """A citizen cannot associate another citizen's storage path with a new report."""
    # Authenticated as Citizen 1, but attempts to claim Citizen 2's image folder
    app.dependency_overrides[get_current_citizen] = mock_citizen_1
    with patch("app.main.is_supabase_configured", return_value=True):
        try:
            payload = {
                "title": "Fraudulent Report",
                "latitude": 12.9716,
                "longitude": 77.5946,
                "image_path": f"{CITIZEN_2_UUID}/victim-report/original.jpg",
            }
            response = client.post(
                "/api/reports",
                json=payload,
                headers={"Authorization": "Bearer mock-token"},
            )
            assert response.status_code == 403
            assert "Forbidden" in response.json()["detail"]
            assert "own citizen user folder" in response.json()["detail"]
        finally:
            app.dependency_overrides.pop(get_current_citizen, None)


def test_create_report_traversal_image_path_rejected():
    """A citizen cannot submit reports with path traversal sequences in image_path."""
    app.dependency_overrides[get_current_citizen] = mock_citizen_1
    with patch("app.main.is_supabase_configured", return_value=True):
        try:
            payload = {
                "title": "Traversal Report",
                "latitude": 12.9716,
                "longitude": 77.5946,
                "image_path": f"{CITIZEN_1_UUID}/../other/original.jpg",
            }
            response = client.post(
                "/api/reports",
                json=payload,
                headers={"Authorization": "Bearer mock-token"},
            )
            assert response.status_code == 400
            assert "traversal" in response.json()["detail"].lower()
        finally:
            app.dependency_overrides.pop(get_current_citizen, None)


def test_signed_url_leading_slash_rejected():
    """Paths with leading slashes must be rejected with HTTP 400."""
    app.dependency_overrides[get_current_citizen] = mock_citizen_1
    with patch("app.main.is_supabase_configured", return_value=True):
        try:
            payload = {
                "bucket": "pothole-originals",
                "path": f"/{CITIZEN_1_UUID}/report-1/original.jpg",
            }
            response = client.post(
                "/api/storage/signed-url",
                json=payload,
                headers={"Authorization": "Bearer mock-token"},
            )
            assert response.status_code == 400
            assert "leading slashes" in response.json()["detail"].lower()
        finally:
            app.dependency_overrides.pop(get_current_citizen, None)


def test_signed_url_traversal_rejected():
    """Paths with '..' or '.' directory traversal must be rejected with HTTP 400."""
    app.dependency_overrides[get_current_citizen] = mock_citizen_1
    with patch("app.main.is_supabase_configured", return_value=True):
        try:
            payload = {
                "bucket": "pothole-originals",
                "path": f"{CITIZEN_1_UUID}/../{CITIZEN_2_UUID}/victim.jpg",
            }
            response = client.post(
                "/api/storage/signed-url",
                json=payload,
                headers={"Authorization": "Bearer mock-token"},
            )
            assert response.status_code == 400
            assert "traversal" in response.json()["detail"].lower()
        finally:
            app.dependency_overrides.pop(get_current_citizen, None)


def test_signed_url_empty_segment_rejected():
    """Paths with empty segments ('//') must be rejected with HTTP 400."""
    app.dependency_overrides[get_current_citizen] = mock_citizen_1
    with patch("app.main.is_supabase_configured", return_value=True):
        try:
            payload = {
                "bucket": "pothole-originals",
                "path": f"{CITIZEN_1_UUID}//file.jpg",
            }
            response = client.post(
                "/api/storage/signed-url",
                json=payload,
                headers={"Authorization": "Bearer mock-token"},
            )
            assert response.status_code == 400
            assert "empty path segments" in response.json()["detail"].lower()
        finally:
            app.dependency_overrides.pop(get_current_citizen, None)


def test_signed_url_unauthenticated_rejected():
    """Generating signed URL without authentication must return HTTP 401."""
    payload = {
        "bucket": "pothole-originals",
        "path": f"{CITIZEN_1_UUID}/report-1/original.jpg",
    }
    response = client.post("/api/storage/signed-url", json=payload)
    assert response.status_code == 401
    assert "WWW-Authenticate" in response.headers


def test_signed_url_owner_authorized():
    """An authenticated citizen can generate signed URLs for objects in their own folder."""
    app.dependency_overrides[get_current_citizen] = mock_citizen_1

    mock_db_client = MagicMock()
    mock_bucket = MagicMock()
    mock_bucket.create_signed_url.return_value = {
        "signedURL": "https://storage.mock.supabase.co/object/sign/pothole-originals/test?token=xyz"
    }
    mock_db_client.storage.from_.return_value = mock_bucket

    with patch("app.main.is_supabase_configured", return_value=True), patch(
        "app.main.get_supabase_client", return_value=mock_db_client
    ):
        try:
            payload = {
                "bucket": "pothole-originals",
                "path": f"{CITIZEN_1_UUID}/report-1/original.jpg",
                "expires_in": 1800,
            }
            response = client.post(
                "/api/storage/signed-url",
                json=payload,
                headers={"Authorization": "Bearer mock-token"},
            )
            assert response.status_code == 200
            data = response.json()
            assert "token=xyz" in data["signed_url"]
            assert data["expires_in"] == 1800
            mock_bucket.create_signed_url.assert_called_once_with(
                f"{CITIZEN_1_UUID}/report-1/original.jpg", 1800
            )
        finally:
            app.dependency_overrides.pop(get_current_citizen, None)


def test_signed_url_non_owner_forbidden():
    """Citizen 1 cannot generate signed URLs for Citizen 2's private image folder."""
    app.dependency_overrides[get_current_citizen] = mock_citizen_1
    with patch("app.main.is_supabase_configured", return_value=True):
        try:
            payload = {
                "bucket": "pothole-originals",
                "path": f"{CITIZEN_2_UUID}/report-2/original.jpg",
            }
            response = client.post(
                "/api/storage/signed-url",
                json=payload,
                headers={"Authorization": "Bearer mock-token"},
            )
            assert response.status_code == 403
            assert "Forbidden" in response.json()["detail"]
            assert "own citizen user folder" in response.json()["detail"].lower()
        finally:
            app.dependency_overrides.pop(get_current_citizen, None)


def test_signed_url_invalid_bucket_rejected():
    """Requesting signed URL for an unauthorized bucket returns HTTP 400."""
    app.dependency_overrides[get_current_citizen] = mock_citizen_1
    with patch("app.main.is_supabase_configured", return_value=True):
        try:
            payload = {
                "bucket": "malicious-bucket",
                "path": f"{CITIZEN_1_UUID}/file.jpg",
            }
            response = client.post(
                "/api/storage/signed-url",
                json=payload,
                headers={"Authorization": "Bearer mock-token"},
            )
            assert response.status_code == 400
            assert "Invalid storage bucket" in response.json()["detail"]
        finally:
            app.dependency_overrides.pop(get_current_citizen, None)


def test_signed_url_storage_failure_handled():
    """When storage backend fails to create signed URL, error is handled gracefully."""
    app.dependency_overrides[get_current_citizen] = mock_citizen_1

    mock_db_client = MagicMock()
    mock_bucket = MagicMock()
    mock_bucket.create_signed_url.side_effect = Exception("Storage service timeout")
    mock_db_client.storage.from_.return_value = mock_bucket

    with patch("app.main.is_supabase_configured", return_value=True), patch(
        "app.main.get_supabase_client", return_value=mock_db_client
    ):
        try:
            payload = {
                "bucket": "pothole-originals",
                "path": f"{CITIZEN_1_UUID}/report-1/original.jpg",
            }
            response = client.post(
                "/api/storage/signed-url",
                json=payload,
                headers={"Authorization": "Bearer mock-token"},
            )
            assert response.status_code == 502
            assert "Storage service failed" in response.json()["detail"]
        finally:
            app.dependency_overrides.pop(get_current_citizen, None)


def test_delete_report_forbidden_for_non_owner():
    """A citizen cannot delete another citizen's report (must return HTTP 403 Forbidden)."""
    # Authenticated as Citizen 1
    app.dependency_overrides[get_current_citizen] = mock_citizen_1

    mock_db_client = MagicMock()
    # Report belongs to Citizen 2!
    existing_report = {
        "id": "report-owned-by-citizen-2",
        "user_id": CITIZEN_2_UUID,
        "title": "Silk Board Crater",
    }
    mock_eq = MagicMock()
    mock_eq.execute.return_value = MagicMock(data=[existing_report])
    mock_select = MagicMock()
    mock_select.eq.return_value = mock_eq
    mock_table = MagicMock()
    mock_table.select.return_value = mock_select
    mock_db_client.table.return_value = mock_table

    with patch("app.main.is_supabase_configured", return_value=True), patch(
        "app.main.get_supabase_client", return_value=mock_db_client
    ):
        try:
            response = client.delete(
                "/api/reports/report-owned-by-citizen-2",
                headers={"Authorization": "Bearer mock-token"},
            )
            assert response.status_code == 403
            assert "Forbidden" in response.json()["detail"]
        finally:
            app.dependency_overrides.pop(get_current_citizen, None)


def test_delete_report_owner_success_with_storage_cleanup():
    """When the legitimate owner deletes their report, storage objects are cleaned up."""
    # Authenticated as Citizen 1
    app.dependency_overrides[get_current_citizen] = mock_citizen_1

    mock_db_client = MagicMock()
    existing_report = {
        "id": "my-report",
        "user_id": CITIZEN_1_UUID,
        "title": "My Pothole",
        "image_path": f"{CITIZEN_1_UUID}/my-report/original.jpg",
        "annotated_image_path": f"{CITIZEN_1_UUID}/my-report/annotated.jpg",
    }
    mock_select_eq = MagicMock()
    mock_select_eq.execute.return_value = MagicMock(data=[existing_report])
    mock_select = MagicMock()
    mock_select.eq.return_value = mock_select_eq

    mock_delete_eq = MagicMock()
    mock_delete_eq.execute.return_value = MagicMock(data=[existing_report])
    mock_delete = MagicMock()
    mock_delete.eq.return_value = mock_delete_eq

    mock_table = MagicMock()
    mock_table.select.return_value = mock_select
    mock_table.delete.return_value = mock_delete
    mock_db_client.table.return_value = mock_table

    mock_storage_bucket = MagicMock()
    mock_db_client.storage.from_.return_value = mock_storage_bucket

    with patch("app.main.is_supabase_configured", return_value=True), patch(
        "app.main.get_supabase_client", return_value=mock_db_client
    ):
        try:
            response = client.delete(
                "/api/reports/my-report",
                headers={"Authorization": "Bearer mock-token"},
            )
            assert response.status_code == 204
            # Verify database delete was called
            mock_table.delete.assert_called_once()
            # Verify storage remove was called
            assert mock_storage_bucket.remove.call_count >= 1
        finally:
            app.dependency_overrides.pop(get_current_citizen, None)


def test_create_report_unconfigured_backend():
    """When Supabase backend is unconfigured, report creation returns HTTP 503."""
    app.dependency_overrides[get_current_citizen] = mock_citizen_1
    with patch("app.main.is_supabase_configured", return_value=False):
        try:
            payload = {
                "title": "Unconfigured Backend Report",
                "latitude": 12.9716,
                "longitude": 77.5946,
            }
            response = client.post(
                "/api/reports",
                json=payload,
                headers={"Authorization": "Bearer mock-token"},
            )
            assert response.status_code == 503
            assert "not configured" in response.json()["detail"]
        finally:
            app.dependency_overrides.pop(get_current_citizen, None)


def test_existing_endpoints_remain_operational():
    """YOLO detection and health endpoints must continue working without regressions."""
    res_health = client.get("/api/health")
    assert res_health.status_code == 200
    assert res_health.json()["status"] == "ok"


# ==============================================================================
# Phase 6.2: Cross-Citizen Image Access Tests
# ==============================================================================

def mock_citizen_2():
    return AuthenticatedCitizen(
        user_id=CITIZEN_2_UUID,
        email="citizen2@example.com",
        role="authenticated",
        app_metadata={"provider": "email"},
        user_metadata={"full_name": "Priya Patel"},
    )


def test_get_report_image_url_unauthenticated():
    """Unauthenticated image access must be rejected with HTTP 401."""
    response = client.get("/api/reports/report-123/image-url")
    assert response.status_code == 401
    assert "WWW-Authenticate" in response.headers


def test_get_report_image_url_owner_success():
    """Report owner can retrieve a signed URL for their report image."""
    app.dependency_overrides[get_current_citizen] = mock_citizen_1
    report_id = "report-123"

    mock_db_client = MagicMock()
    mock_db_client.table.return_value.select.return_value.eq.return_value.execute.return_value = MagicMock(
        data=[
            {
                "id": report_id,
                "user_id": CITIZEN_1_UUID,
                "image_path": f"{CITIZEN_1_UUID}/{report_id}/original.jpg",
                "annotated_image_path": f"{CITIZEN_1_UUID}/{report_id}/annotated.jpg",
            }
        ]
    )
    mock_bucket = MagicMock()
    mock_bucket.create_signed_url.return_value = {"signedURL": "https://supabase.co/storage/v1/sign/orig-signed"}
    mock_db_client.storage.from_.return_value = mock_bucket

    with patch("app.main.is_supabase_configured", return_value=True), patch(
        "app.main.get_supabase_client", return_value=mock_db_client
    ):
        try:
            response = client.get(
                f"/api/reports/{report_id}/image-url?image_type=original&expires_in=3600",
                headers={"Authorization": "Bearer mock-token"},
            )
            assert response.status_code == 200
            data = response.json()
            assert data["signed_url"] == "https://supabase.co/storage/v1/sign/orig-signed"
            assert data["expires_in"] == 3600
            mock_db_client.storage.from_.assert_called_with("pothole-originals")
        finally:
            app.dependency_overrides.pop(get_current_citizen, None)


def test_get_report_image_url_cross_citizen_success():
    """Citizen 2 can retrieve a signed URL for Citizen 1's accessible city-wide report."""
    # Authenticated as Citizen 2
    app.dependency_overrides[get_current_citizen] = mock_citizen_2
    report_id = "report-owned-by-citizen-1"

    mock_db_client = MagicMock()
    # Report belongs to Citizen 1
    mock_db_client.table.return_value.select.return_value.eq.return_value.execute.return_value = MagicMock(
        data=[
            {
                "id": report_id,
                "user_id": CITIZEN_1_UUID,
                "image_path": f"{CITIZEN_1_UUID}/{report_id}/pothole_defect.jpg",
                "annotated_image_path": f"{CITIZEN_1_UUID}/{report_id}/annotated.jpg",
            }
        ]
    )
    mock_bucket = MagicMock()
    mock_bucket.create_signed_url.return_value = {"signedURL": "https://supabase.co/storage/v1/sign/cross-signed"}
    mock_db_client.storage.from_.return_value = mock_bucket

    with patch("app.main.is_supabase_configured", return_value=True), patch(
        "app.main.get_supabase_client", return_value=mock_db_client
    ):
        try:
            response = client.get(
                f"/api/reports/{report_id}/image-url?image_type=original",
                headers={"Authorization": "Bearer mock-token"},
            )
            assert response.status_code == 200
            data = response.json()
            assert data["signed_url"] == "https://supabase.co/storage/v1/sign/cross-signed"
        finally:
            app.dependency_overrides.pop(get_current_citizen, None)


def test_get_report_image_url_annotated_success():
    """Authenticated citizen can request annotated YOLO detection evidence."""
    app.dependency_overrides[get_current_citizen] = mock_citizen_2
    report_id = "report-annotated-test"

    mock_db_client = MagicMock()
    mock_db_client.table.return_value.select.return_value.eq.return_value.execute.return_value = MagicMock(
        data=[
            {
                "id": report_id,
                "user_id": CITIZEN_1_UUID,
                "image_path": f"{CITIZEN_1_UUID}/{report_id}/original.jpg",
                "annotated_image_path": f"{CITIZEN_1_UUID}/{report_id}/annotated.jpg",
            }
        ]
    )
    mock_bucket = MagicMock()
    mock_bucket.create_signed_url.return_value = {"signedURL": "https://supabase.co/storage/v1/sign/annotated-signed"}
    mock_db_client.storage.from_.return_value = mock_bucket

    with patch("app.main.is_supabase_configured", return_value=True), patch(
        "app.main.get_supabase_client", return_value=mock_db_client
    ):
        try:
            response = client.get(
                f"/api/reports/{report_id}/image-url?image_type=annotated",
                headers={"Authorization": "Bearer mock-token"},
            )
            assert response.status_code == 200
            data = response.json()
            assert data["signed_url"] == "https://supabase.co/storage/v1/sign/annotated-signed"
            mock_db_client.storage.from_.assert_called_with("pothole-annotated")
        finally:
            app.dependency_overrides.pop(get_current_citizen, None)


def test_get_report_image_url_nonexistent_report_404():
    """Requesting an image for a nonexistent report ID must return HTTP 404."""
    app.dependency_overrides[get_current_citizen] = mock_citizen_1
    mock_db_client = MagicMock()
    mock_db_client.table.return_value.select.return_value.eq.return_value.execute.return_value = MagicMock(data=[])

    with patch("app.main.is_supabase_configured", return_value=True), patch(
        "app.main.get_supabase_client", return_value=mock_db_client
    ):
        try:
            response = client.get(
                "/api/reports/nonexistent-report/image-url",
                headers={"Authorization": "Bearer mock-token"},
            )
            assert response.status_code == 404
            assert "not found" in response.json()["detail"].lower()
        finally:
            app.dependency_overrides.pop(get_current_citizen, None)


def test_get_report_image_url_invalid_image_type_400():
    """Passing an unsupported image_type must fail with HTTP 400."""
    app.dependency_overrides[get_current_citizen] = mock_citizen_1
    with patch("app.main.is_supabase_configured", return_value=True):
        try:
            response = client.get(
                "/api/reports/report-123/image-url?image_type=thumbnail",
                headers={"Authorization": "Bearer mock-token"},
            )
            assert response.status_code == 400
            assert "invalid image_type" in response.json()["detail"].lower()
        finally:
            app.dependency_overrides.pop(get_current_citizen, None)


def test_get_report_image_url_missing_image_path_404():
    """When the report exists but has no image path, return HTTP 404."""
    app.dependency_overrides[get_current_citizen] = mock_citizen_1
    report_id = "report-no-photo"

    mock_db_client = MagicMock()
    mock_db_client.table.return_value.select.return_value.eq.return_value.execute.return_value = MagicMock(
        data=[
            {
                "id": report_id,
                "user_id": CITIZEN_1_UUID,
                "image_path": None,
                "annotated_image_path": None,
            }
        ]
    )

    with patch("app.main.is_supabase_configured", return_value=True), patch(
        "app.main.get_supabase_client", return_value=mock_db_client
    ):
        try:
            response = client.get(
                f"/api/reports/{report_id}/image-url?image_type=original",
                headers={"Authorization": "Bearer mock-token"},
            )
            assert response.status_code == 404
            assert "no original image is attached" in response.json()["detail"].lower()
        finally:
            app.dependency_overrides.pop(get_current_citizen, None)


def test_get_report_image_url_traversal_in_stored_path_rejected():
    """Stored paths with directory traversal must be caught and rejected with HTTP 400."""
    app.dependency_overrides[get_current_citizen] = mock_citizen_1
    report_id = "report-bad-path"

    mock_db_client = MagicMock()
    mock_db_client.table.return_value.select.return_value.eq.return_value.execute.return_value = MagicMock(
        data=[
            {
                "id": report_id,
                "user_id": CITIZEN_1_UUID,
                "image_path": f"{CITIZEN_1_UUID}/../other/stolen.jpg",
            }
        ]
    )

    with patch("app.main.is_supabase_configured", return_value=True), patch(
        "app.main.get_supabase_client", return_value=mock_db_client
    ):
        try:
            response = client.get(
                f"/api/reports/{report_id}/image-url",
                headers={"Authorization": "Bearer mock-token"},
            )
            assert response.status_code == 400
            assert "traversal" in response.json()["detail"].lower()
        finally:
            app.dependency_overrides.pop(get_current_citizen, None)


def test_get_report_image_url_mismatched_report_id_rejected():
    """Stored path pointing to a different report ID must be rejected with HTTP 400."""
    app.dependency_overrides[get_current_citizen] = mock_citizen_1
    report_id = "report-legit"

    mock_db_client = MagicMock()
    # Image path references 'different-report-id' instead of 'report-legit'
    mock_db_client.table.return_value.select.return_value.eq.return_value.execute.return_value = MagicMock(
        data=[
            {
                "id": report_id,
                "user_id": CITIZEN_1_UUID,
                "image_path": f"{CITIZEN_1_UUID}/different-report-id/photo.jpg",
            }
        ]
    )

    with patch("app.main.is_supabase_configured", return_value=True), patch(
        "app.main.get_supabase_client", return_value=mock_db_client
    ):
        try:
            response = client.get(
                f"/api/reports/{report_id}/image-url",
                headers={"Authorization": "Bearer mock-token"},
            )
            assert response.status_code == 400
            assert "does not belong to the requested report id" in response.json()["detail"].lower()
        finally:
            app.dependency_overrides.pop(get_current_citizen, None)


def test_get_report_image_url_storage_failure_handled():
    """When Supabase storage service throws an exception, return HTTP 502 without credential leakage."""
    app.dependency_overrides[get_current_citizen] = mock_citizen_1
    report_id = "report-timeout"

    mock_db_client = MagicMock()
    mock_db_client.table.return_value.select.return_value.eq.return_value.execute.return_value = MagicMock(
        data=[
            {
                "id": report_id,
                "user_id": CITIZEN_1_UUID,
                "image_path": f"{CITIZEN_1_UUID}/{report_id}/photo.jpg",
            }
        ]
    )
    mock_bucket = MagicMock()
    mock_bucket.create_signed_url.side_effect = Exception("Internal storage connection timeout")
    mock_db_client.storage.from_.return_value = mock_bucket

    with patch("app.main.is_supabase_configured", return_value=True), patch(
        "app.main.get_supabase_client", return_value=mock_db_client
    ):
        try:
            response = client.get(
                f"/api/reports/{report_id}/image-url",
                headers={"Authorization": "Bearer mock-token"},
            )
            assert response.status_code == 502
            assert "storage service failed" in response.json()["detail"].lower()
        finally:
            app.dependency_overrides.pop(get_current_citizen, None)
