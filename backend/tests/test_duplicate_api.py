"""API integration tests for Duplicate Detection and Review Endpoints (Phase 4)."""

from unittest.mock import MagicMock, patch
from fastapi.testclient import TestClient

from app.main import app
from app.schemas import AuthenticatedCitizen
from app.auth import get_current_citizen

client = TestClient(app)

CITIZEN_1_UUID = "11111111-1111-4111-a111-111111111111"
CITIZEN_2_UUID = "22222222-2222-4222-a222-222222222222"
CITIZEN_3_UUID = "33333333-3333-4333-a333-333333333333"


def mock_citizen_1():
    return AuthenticatedCitizen(
        user_id=CITIZEN_1_UUID,
        email="citizen1@example.com",
        role="authenticated",
        app_metadata={"provider": "email"},
        user_metadata={"full_name": "Aarav Sharma"},
    )


def mock_citizen_3():
    return AuthenticatedCitizen(
        user_id=CITIZEN_3_UUID,
        email="citizen3@example.com",
        role="authenticated",
        app_metadata={"provider": "email"},
        user_metadata={"full_name": "Rahul Verma"},
    )


def mock_admin_citizen():
    return AuthenticatedCitizen(
        user_id=CITIZEN_3_UUID,
        email="admin@bbmp.gov.in",
        role="authenticated",
        app_metadata={"provider": "email", "role": "admin"},
        user_metadata={"full_name": "BBMP Admin"},
    )


def mock_spoofed_admin_citizen():
    return AuthenticatedCitizen(
        user_id=CITIZEN_3_UUID,
        email="attacker@example.com",
        role="authenticated",
        app_metadata={"provider": "email"},
        user_metadata={"role": "admin", "full_name": "Spoofer"},
    )


def test_trigger_duplicate_detection_unauthenticated_rejected():
    """Unauthenticated access to trigger duplicate detection must return 401."""
    res = client.post("/api/reports/rep-123/check-duplicates")
    assert res.status_code == 401
    assert "WWW-Authenticate" in res.headers


def test_trigger_duplicate_detection_owner_success():
    """Report owner can successfully trigger duplicate scan."""
    app.dependency_overrides[get_current_citizen] = mock_citizen_1
    mock_scan_res = {
        "report_id": "rep-123",
        "candidates_found": 1,
        "candidates": [
            {
                "id": "cand-001",
                "primary_report_id": "rep-123",
                "incoming_report_id": "rep-456",
                "distance_meters": 18.5,
                "hamming_distance": 3,
                "similarity_pct": 95.31,
                "classification": "strong_duplicate",
                "reason": "Strong visual match with close physical proximity.",
                "status": "pending",
            }
        ],
        "phash": "1234567890abcdef",
    }
    mock_report = {"id": "rep-123", "user_id": CITIZEN_1_UUID}
    mock_client = MagicMock()
    mock_client.table().select().eq().execute.return_value = MagicMock(data=[mock_report])

    with patch("app.main.is_supabase_configured", return_value=True), patch(
        "app.main.get_supabase_client", return_value=mock_client
    ), patch("app.main.scan_for_duplicates", return_value=mock_scan_res):
        try:
            res = client.post(
                "/api/reports/rep-123/check-duplicates",
                headers={"Authorization": "Bearer mock-token"},
            )
            assert res.status_code == 200
            data = res.json()
            assert data["report_id"] == "rep-123"
            assert data["candidates_found"] == 1
            assert data["candidates"][0]["id"] == "cand-001"
        finally:
            app.dependency_overrides.pop(get_current_citizen, None)


def test_trigger_duplicate_detection_non_owner_forbidden():
    """Non-owner citizen receives 403 Forbidden when attempting to scan another person's report."""
    # Authenticated as Citizen 3, but report belongs to Citizen 1
    app.dependency_overrides[get_current_citizen] = mock_citizen_3
    mock_report = {"id": "rep-123", "user_id": CITIZEN_1_UUID}
    mock_client = MagicMock()
    mock_client.table().select().eq().execute.return_value = MagicMock(data=[mock_report])

    with patch("app.main.is_supabase_configured", return_value=True), patch(
        "app.main.get_supabase_client", return_value=mock_client
    ):
        try:
            res = client.post(
                "/api/reports/rep-123/check-duplicates",
                headers={"Authorization": "Bearer mock-token"},
            )
            assert res.status_code == 403
            assert "Forbidden" in res.json()["detail"]
        finally:
            app.dependency_overrides.pop(get_current_citizen, None)


def test_trigger_duplicate_detection_missing_report_not_found():
    """Requesting duplicate scan for non-existent report returns 404 Not Found."""
    app.dependency_overrides[get_current_citizen] = mock_citizen_1
    mock_client = MagicMock()
    mock_client.table().select().eq().execute.return_value = MagicMock(data=[])

    with patch("app.main.is_supabase_configured", return_value=True), patch(
        "app.main.get_supabase_client", return_value=mock_client
    ):
        try:
            res = client.post(
                "/api/reports/rep-nonexistent/check-duplicates",
                headers={"Authorization": "Bearer mock-token"},
            )
            assert res.status_code == 404
            assert "not found" in res.json()["detail"].lower()
        finally:
            app.dependency_overrides.pop(get_current_citizen, None)


def test_trigger_duplicate_detection_app_metadata_admin_success():
    """Administrator with trusted app_metadata can trigger duplicate scan on any report."""
    app.dependency_overrides[get_current_citizen] = mock_admin_citizen
    mock_scan_res = {
        "report_id": "rep-123",
        "candidates_found": 0,
        "candidates": [],
        "phash": "1234567890abcdef",
    }
    # Report belongs to Citizen 1, but caller is admin (Citizen 3)
    mock_report = {"id": "rep-123", "user_id": CITIZEN_1_UUID}
    mock_client = MagicMock()
    mock_client.table().select().eq().execute.return_value = MagicMock(data=[mock_report])

    with patch("app.main.is_supabase_configured", return_value=True), patch(
        "app.main.get_supabase_client", return_value=mock_client
    ), patch("app.main.scan_for_duplicates", return_value=mock_scan_res):
        try:
            res = client.post(
                "/api/reports/rep-123/check-duplicates",
                headers={"Authorization": "Bearer mock-token"},
            )
            assert res.status_code == 200
            data = res.json()
            assert data["report_id"] == "rep-123"
        finally:
            app.dependency_overrides.pop(get_current_citizen, None)


def test_trigger_duplicate_detection_user_metadata_admin_rejected():
    """Citizen claiming admin via untrusted user_metadata cannot scan another person's report (403)."""
    app.dependency_overrides[get_current_citizen] = mock_spoofed_admin_citizen
    mock_report = {"id": "rep-123", "user_id": CITIZEN_1_UUID}
    mock_client = MagicMock()
    mock_client.table().select().eq().execute.return_value = MagicMock(data=[mock_report])

    with patch("app.main.is_supabase_configured", return_value=True), patch(
        "app.main.get_supabase_client", return_value=mock_client
    ):
        try:
            res = client.post(
                "/api/reports/rep-123/check-duplicates",
                headers={"Authorization": "Bearer mock-token"},
            )
            assert res.status_code == 403
            assert "Forbidden" in res.json()["detail"]
        finally:
            app.dependency_overrides.pop(get_current_citizen, None)


def test_list_duplicates_unauthenticated_rejected():
    """Unauthenticated request to list duplicate candidates returns 401."""
    res = client.get("/api/duplicates")
    assert res.status_code == 401


def test_list_duplicates_authenticated():
    """Authenticated citizen can list duplicate candidates, and response never exposes reviewed_by or review_notes."""
    app.dependency_overrides[get_current_citizen] = mock_citizen_1
    mock_candidates = [
        {
            "id": "cand-001",
            "primary_report_id": "rep-1",
            "incoming_report_id": "rep-2",
            "distance_meters": 20.0,
            "classification": "strong_duplicate",
            "reason": "Close proximity",
            "status": "pending",
            "reviewed_by": CITIZEN_1_UUID,
            "review_notes": "Internal city engineer note",
            "reviewed_at": "2026-11-08T12:00:00Z",
        }
    ]

    with patch("app.main.list_duplicate_candidates", return_value=mock_candidates):
        try:
            res = client.get(
                "/api/duplicates?status=pending",
                headers={"Authorization": "Bearer mock-token"},
            )
            assert res.status_code == 200
            data = res.json()
            assert len(data) == 1
            item = data[0]
            assert item["id"] == "cand-001"
            assert "reviewed_by" not in item
            assert "review_notes" not in item
            assert item.get("reviewed_at") == "2026-11-08T12:00:00Z"
        finally:
            app.dependency_overrides.pop(get_current_citizen, None)


def test_triage_duplicate_unauthorized_citizen_forbidden():
    """Citizen who owns neither report in the candidate pair is rejected with 403 Forbidden."""
    # Authenticated as Citizen 3 (uninvolved)
    app.dependency_overrides[get_current_citizen] = mock_citizen_3

    with patch(
        "app.main.review_duplicate_candidate",
        side_effect=PermissionError("Forbidden: You can only review duplicate candidates for your reports."),
    ):
        try:
            payload = {"status": "confirmed", "review_notes": "Looks duplicate"}
            res = client.patch(
                "/api/duplicates/cand-001",
                json=payload,
                headers={"Authorization": "Bearer mock-token"},
            )
            assert res.status_code == 403
            assert "Forbidden" in res.json()["detail"]
        finally:
            app.dependency_overrides.pop(get_current_citizen, None)


def test_triage_duplicate_owner_authorized():
    """Citizen who owns one of the reports can successfully confirm/reject the duplicate.

    Ensures the response does not expose restricted fields (reviewed_by and review_notes).
    """
    # Authenticated as Citizen 1 (legitimate owner)
    app.dependency_overrides[get_current_citizen] = mock_citizen_1

    mock_reviewed_candidate = {
        "id": "cand-001",
        "primary_report_id": "rep-1",
        "incoming_report_id": "rep-2",
        "distance_meters": 15.0,
        "classification": "strong_duplicate",
        "reason": "Verified",
        "status": "confirmed",
        "reviewed_by": CITIZEN_1_UUID,
        "review_notes": "Confirmed by reporter",
    }

    with patch("app.main.review_duplicate_candidate", return_value=mock_reviewed_candidate):
        try:
            payload = {"status": "confirmed", "review_notes": "Confirmed by reporter"}
            res = client.patch(
                "/api/duplicates/cand-001",
                json=payload,
                headers={"Authorization": "Bearer mock-token"},
            )
            assert res.status_code == 200
            data = res.json()
            assert data["status"] == "confirmed"
            assert "reviewed_by" not in data
            assert "review_notes" not in data
        finally:
            app.dependency_overrides.pop(get_current_citizen, None)


def test_triage_duplicate_app_metadata_admin_authorized():
    """Admin with trusted app_metadata role='admin' can review even if not the report owner."""
    app.dependency_overrides[get_current_citizen] = mock_admin_citizen

    mock_reviewed_candidate = {
        "id": "cand-001",
        "primary_report_id": "rep-1",
        "incoming_report_id": "rep-2",
        "distance_meters": 15.0,
        "classification": "strong_duplicate",
        "reason": "Verified by admin",
        "status": "confirmed",
        "reviewed_by": CITIZEN_3_UUID,
        "review_notes": "Official BBMP admin review note",
    }

    with patch("app.main.review_duplicate_candidate", return_value=mock_reviewed_candidate) as mock_review:
        try:
            payload = {"status": "confirmed", "review_notes": "Official BBMP admin review note"}
            res = client.patch(
                "/api/duplicates/cand-001",
                json=payload,
                headers={"Authorization": "Bearer mock-token"},
            )
            assert res.status_code == 200
            data = res.json()
            assert data["status"] == "confirmed"
            assert "reviewed_by" not in data
            assert "review_notes" not in data
            # Ensure is_admin was passed as True to service
            assert mock_review.call_args[1]["is_admin"] is True
        finally:
            app.dependency_overrides.pop(get_current_citizen, None)


def test_triage_duplicate_user_metadata_admin_rejected():
    """Citizen claiming admin via untrusted user_metadata is rejected as non-admin."""
    app.dependency_overrides[get_current_citizen] = mock_spoofed_admin_citizen

    with patch(
        "app.main.review_duplicate_candidate",
        side_effect=PermissionError("Forbidden: You can only review duplicate candidates for your reports."),
    ) as mock_review:
        try:
            payload = {"status": "confirmed", "review_notes": "Spoofed review"}
            res = client.patch(
                "/api/duplicates/cand-001",
                json=payload,
                headers={"Authorization": "Bearer mock-token"},
            )
            assert res.status_code == 403
            assert "Forbidden" in res.json()["detail"]
            # Ensure is_admin was passed as False (user_metadata was untrusted and ignored)
            assert mock_review.call_args[1]["is_admin"] is False
        finally:
            app.dependency_overrides.pop(get_current_citizen, None)


def test_triage_duplicate_invalid_status_rejected():
    """Invalid review status (e.g. 'not_a_status') must return 400 Bad Request."""
    app.dependency_overrides[get_current_citizen] = mock_citizen_1
    with patch(
        "app.main.review_duplicate_candidate",
        side_effect=ValueError("Invalid review status 'maybe'. Allowed: confirmed, rejected."),
    ):
        try:
            payload = {"status": "maybe"}
            res = client.patch(
                "/api/duplicates/cand-001",
                json=payload,
                headers={"Authorization": "Bearer mock-token"},
            )
            assert res.status_code == 400
            assert "Invalid review status" in res.json()["detail"]
        finally:
            app.dependency_overrides.pop(get_current_citizen, None)
