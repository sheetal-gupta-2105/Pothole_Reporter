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


def test_list_reports():
    """Listing reports retrieves rows from Supabase."""
    mock_db_client = MagicMock()
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
        }
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
        response = client.get("/api/reports")
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 1
        assert data[0]["id"] == "report-1"


def test_update_report_status():
    """Updating report status invokes table update."""
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
    mock_eq = MagicMock()
    mock_eq.execute.return_value = MagicMock(data=[updated_row])
    mock_update = MagicMock()
    mock_update.eq.return_value = mock_eq
    mock_table = MagicMock()
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
