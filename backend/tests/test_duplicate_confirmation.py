"""Unit tests for Phase 5.3 Duplicate Confirmation & Persistence.

Tests transactional duplicate confirmation via PostgreSQL RPC, priority score
recalculation upon duplicate confirmation, idempotency, and conflict prevention.
"""

from pathlib import Path
import re
from unittest.mock import MagicMock, patch
import pytest

from app.duplicate_service import review_duplicate_candidate
from app.priority import calculate_priority_score

CITIZEN_1_UUID = "11111111-1111-4111-a111-111111111111"
CITIZEN_2_UUID = "22222222-2222-4222-a222-222222222222"
CITIZEN_3_UUID = "33333333-3333-4333-a333-333333333333"


def test_duplicate_review_rpc_migration_security_and_idempotency():
    """Verify Phase 5.3 migration creates a secure, transactional, service-role-only confirmation RPC."""
    migration_path = (
        Path(__file__).resolve().parent.parent.parent
        / "supabase"
        / "migrations"
        / "20261116_phase5_duplicate_review_rpc.sql"
    )
    assert migration_path.exists(), f"Migration file not found at {migration_path}"
    sql_content = migration_path.read_text(encoding="utf-8")

    # 1. Function must be defined with SECURITY DEFINER
    assert re.search(
        r"CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.confirm_duplicate_candidate",
        sql_content,
        re.IGNORECASE,
    ), "Migration must create confirm_duplicate_candidate function"
    assert re.search(r"SECURITY\s+DEFINER", sql_content, re.IGNORECASE)

    # 2. Empty search_path prevents implicit object resolution
    assert re.search(
        r"SET\s+search_path\s*=\s*''", sql_content, re.IGNORECASE
    ), "search_path must be empty"

    # All database objects used by the function must be schema-qualified.
    function_body = sql_content.split("AS $$", 1)[1].split("$$;", 1)[0]
    assert re.search(r"FROM\s+public\.duplicate_candidates", function_body, re.IGNORECASE)
    assert re.search(r"UPDATE\s+public\.duplicate_candidates", function_body, re.IGNORECASE)
    assert re.search(r"FROM\s+public\.reports", function_body, re.IGNORECASE)
    assert re.search(r"UPDATE\s+public\.reports", function_body, re.IGNORECASE)
    assert re.search(r"pg_catalog\.clock_timestamp", function_body, re.IGNORECASE)
    assert re.search(r"pg_catalog\.jsonb_build_object", function_body, re.IGNORECASE)

    # 3. Restrict execution permissions: REVOKE from public, anon, authenticated
    assert re.search(
        r"REVOKE\s+ALL\s+ON\s+FUNCTION\s+public\.confirm_duplicate_candidate\(UUID,\s*UUID,\s*TEXT\)\s+FROM\s+PUBLIC,\s*anon,\s*authenticated",
        sql_content,
        re.IGNORECASE,
    ), "Must revoke execute on confirm_duplicate_candidate from public, anon, and authenticated"

    # 4. Grant execution solely to service_role
    assert re.search(
        r"GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.confirm_duplicate_candidate\(UUID,\s*UUID,\s*TEXT\)\s+TO\s+service_role",
        sql_content,
        re.IGNORECASE,
    ), "Must grant execute on confirm_duplicate_candidate to service_role"

    # 5. Row locking for concurrency safety
    assert re.search(r"FOR\s+UPDATE", sql_content, re.IGNORECASE)

    # 6. Prevents self-duplicate linkage
    assert re.search(r"primary_report_id\s*=\s*v_candidate\.incoming_report_id", sql_content)

    # 7. Prevents conflicting duplicate-master assignments
    assert re.search(r"v_primary\.duplicate_of_id\s+IS\s+NOT\s+NULL", sql_content)


def test_duplicate_confirmation_invokes_rpc_and_recalculates_primary_score():
    """Confirming a duplicate candidate must invoke the RPC and recalculate primary priority score."""
    mock_candidate = {
        "id": "cand-001",
        "primary_report_id": "rep-primary",
        "incoming_report_id": "rep-incoming",
        "status": "pending",
        "primary_report": {
            "id": "rep-primary",
            "user_id": CITIZEN_1_UUID,
            "priority": "high",
            "pothole_count": 2,
            "duplicate_count": 0,
            "created_at": "2026-11-10T10:00:00Z",
        },
        "incoming_report": {
            "id": "rep-incoming",
            "user_id": CITIZEN_2_UUID,
            "priority": "medium",
            "pothole_count": 1,
            "duplicate_count": 0,
            "created_at": "2026-11-12T12:00:00Z",
        },
    }

    # Primary report with incremented duplicate_count after RPC
    updated_primary_row = {
        **mock_candidate["primary_report"],
        "duplicate_count": 1,
    }

    mock_client = MagicMock()
    confirmed_candidate = {**mock_candidate, "status": "confirmed"}
    # The implementation reads initial candidate, refreshed joined candidate,
    # then the committed primary report in that order.
    mock_client.table().select().eq().execute.side_effect = [
        MagicMock(data=[mock_candidate]),
        MagicMock(data=[confirmed_candidate]),
        MagicMock(data=[updated_primary_row]),
    ]

    # Mock RPC execution response
    mock_client.rpc.return_value.execute.return_value = MagicMock(
        data={
            "success": True,
            "candidate_id": "cand-001",
            "primary_report_id": "rep-primary",
            "incoming_report_id": "rep-incoming",
            "already_confirmed": False,
            "newly_confirmed": True,
            "primary_duplicate_count": 1,
        }
    )

    mock_client.table().update().eq().execute.return_value = MagicMock(data=[])

    with patch("app.duplicate_service.is_supabase_configured", return_value=True), patch(
        "app.duplicate_service.get_supabase_client", return_value=mock_client
    ):
        result = review_duplicate_candidate(
            candidate_id="cand-001",
            new_status="confirmed",
            reviewer_user_id=CITIZEN_1_UUID,
            review_notes="Verified exact duplicate location and crater",
            client=mock_client,
        )

        assert result["status"] == "confirmed"
        assert result["primary_report"]["duplicate_count"] == 1
        # 1. Verify RPC was called with expected arguments
        mock_client.rpc.assert_called_once_with(
            "confirm_duplicate_candidate",
            {
                "p_candidate_id": "cand-001",
                "p_reviewer_user_id": CITIZEN_1_UUID,
                "p_review_notes": "Verified exact duplicate location and crater",
            },
        )
        expected_score = calculate_priority_score(
            priority=updated_primary_row["priority"],
            pothole_count=updated_primary_row["pothole_count"],
            ai_detection=updated_primary_row.get("ai_detection"),
            duplicate_count=updated_primary_row["duplicate_count"],
            created_at=updated_primary_row["created_at"],
        ).total_score
        update_payload = mock_client.table().update.call_args[0][0]
        assert update_payload["priority_score"] == expected_score
        assert "updated_at" in update_payload
        assert mock_client.table().update().eq.call_args.args == ("id", "rep-primary")


def test_duplicate_confirmation_rejection_leaves_reports_unchanged():
    """Rejecting a duplicate candidate does not invoke RPC and leaves reports unlinked."""
    mock_candidate = {
        "id": "cand-002",
        "primary_report_id": "rep-primary",
        "incoming_report_id": "rep-incoming",
        "status": "pending",
        "primary_report": {"id": "rep-primary", "user_id": CITIZEN_1_UUID},
        "incoming_report": {"id": "rep-incoming", "user_id": CITIZEN_2_UUID},
    }

    mock_client = MagicMock()
    mock_client.table().select().eq().execute.return_value = MagicMock(
        data=[mock_candidate]
    )
    mock_client.table().update().eq().execute.return_value = MagicMock(
        data=[{**mock_candidate, "status": "rejected"}]
    )

    with patch("app.duplicate_service.is_supabase_configured", return_value=True), patch(
        "app.duplicate_service.get_supabase_client", return_value=mock_client
    ):
        result = review_duplicate_candidate(
            candidate_id="cand-002",
            new_status="rejected",
            reviewer_user_id=CITIZEN_1_UUID,
            review_notes="Separate potholes 15 meters apart on opposite carriageways",
            client=mock_client,
        )

        assert result["status"] == "rejected"
        # RPC should NOT be called for rejections
        assert not mock_client.rpc.called


def test_duplicate_confirmation_handles_rpc_conflict_error():
    """RPC exceptions for conflicting duplicate linkage propagate as ValueError (HTTP 400)."""
    mock_candidate = {
        "id": "cand-003",
        "primary_report_id": "rep-1",
        "incoming_report_id": "rep-2",
        "status": "pending",
        "primary_report": {"id": "rep-1", "user_id": CITIZEN_1_UUID},
        "incoming_report": {"id": "rep-2", "user_id": CITIZEN_2_UUID},
    }

    mock_client = MagicMock()
    mock_client.table().select().eq().execute.return_value = MagicMock(
        data=[mock_candidate]
    )
    mock_client.rpc.return_value.execute.side_effect = Exception(
        "Incoming report rep-2 is already linked as duplicate to rep-3"
    )

    with patch("app.duplicate_service.is_supabase_configured", return_value=True), patch(
        "app.duplicate_service.get_supabase_client", return_value=mock_client
    ):
        with pytest.raises(ValueError, match="already linked"):
            review_duplicate_candidate(
                candidate_id="cand-003",
                new_status="confirmed",
                reviewer_user_id=CITIZEN_1_UUID,
                client=mock_client,
            )
