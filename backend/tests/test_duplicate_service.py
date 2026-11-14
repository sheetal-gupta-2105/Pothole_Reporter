"""Unit tests for Backend Duplicate Detection Service (Phase 4)."""

from unittest.mock import MagicMock, patch
import pytest
from app.duplicate_service import (
    classify_duplicate,
    get_canonical_pair,
    scan_for_duplicates,
    review_duplicate_candidate,
)

CITIZEN_1_UUID = "11111111-1111-4111-a111-111111111111"
CITIZEN_2_UUID = "22222222-2222-4222-a222-222222222222"
CITIZEN_3_UUID = "33333333-3333-4333-a333-333333333333"


def test_classify_duplicate_logic():
    """Verify classification logic based on spatial distance and pHash Hamming distance."""
    # 1. Beyond 50m radius -> not_duplicate regardless of image
    cls, reason, sim = classify_duplicate(55.0, 0)
    assert cls == "not_duplicate"
    assert "exceeds 50m" in reason

    # 2. Within 50m, strong visual similarity (Hamming <= 10) -> strong_duplicate
    cls, reason, sim = classify_duplicate(25.0, 4)
    assert cls == "strong_duplicate"
    assert sim is not None and sim > 90.0
    assert "Strong visual match" in reason

    # 3. Within 50m, moderate visual similarity (10 < Hamming <= 20) -> possible_duplicate
    cls, reason, sim = classify_duplicate(35.0, 15)
    assert cls == "possible_duplicate"
    assert sim is not None and 65.0 <= sim <= 85.0
    assert "moderate visual correlation" in reason

    # 4. Within 50m, low visual similarity (Hamming > 20) -> not_duplicate
    cls, reason, sim = classify_duplicate(15.0, 25)
    assert cls == "not_duplicate"
    assert "distinct road defects" in reason

    # 5. Within 50m, image hash missing (None) -> possible_duplicate
    cls, reason, sim = classify_duplicate(20.0, None)
    assert cls == "possible_duplicate"
    assert sim is None
    assert "Image hash unavailable" in reason


def test_get_canonical_pair_ordering():
    """Earlier created report must be designated as the primary report."""
    older = {
        "id": "rep-old",
        "created_at": "2026-11-01T10:00:00Z",
    }
    newer = {
        "id": "rep-new",
        "created_at": "2026-11-05T12:00:00Z",
    }

    p1, i1 = get_canonical_pair(older, newer)
    assert p1["id"] == "rep-old"
    assert i1["id"] == "rep-new"

    p2, i2 = get_canonical_pair(newer, older)
    assert p2["id"] == "rep-old"
    assert i2["id"] == "rep-new"


def test_scan_for_duplicates_prevents_self_comparison():
    """Duplicate scanning must never match a report with itself."""
    target_id = "report-abc"
    target_report = {
        "id": target_id,
        "latitude": 12.9352,
        "longitude": 77.6823,
        "phash": "0123456789abcdef",
        "created_at": "2026-11-08T12:00:00Z",
    }

    mock_client = MagicMock()
    # Mock fetching target report
    mock_target_res = MagicMock(data=[target_report])
    mock_client.table().select().eq().execute.return_value = mock_target_res

    # Mock spatial query returning only the report itself
    mock_spatial_res = MagicMock(data=[])
    mock_client.table().select().neq().gte().lte().gte().lte().execute.return_value = (
        mock_spatial_res
    )

    with patch("app.duplicate_service.is_supabase_configured", return_value=True), patch(
        "app.duplicate_service.get_supabase_client", return_value=mock_client
    ):
        result = scan_for_duplicates(target_id)
        assert result["candidates_found"] == 0
        assert len(result["candidates"]) == 0


def test_scan_for_duplicates_creates_candidate():
    """Nearby report with matching hash generates a persisted candidate pair."""
    target_id = "report-1"
    cand_id = "report-2"

    target_report = {
        "id": target_id,
        "user_id": CITIZEN_1_UUID,
        "latitude": 12.935200,
        "longitude": 77.682300,
        "phash": "ffff0000ffff0000",
        "created_at": "2026-11-08T14:00:00Z",
    }
    existing_candidate = {
        "id": cand_id,
        "user_id": CITIZEN_2_UUID,
        "latitude": 12.935300,  # ~11 meters away
        "longitude": 77.682300,
        "phash": "ffff0000ffff0001",  # Hamming distance = 1
        "created_at": "2026-11-08T10:00:00Z",  # Older -> Primary!
    }

    mock_client = MagicMock()
    # Mock target fetch
    mock_client.table().select().eq().execute.return_value = MagicMock(
        data=[target_report]
    )
    # Mock spatial query
    mock_client.table().select().neq().gte().lte().gte().lte().execute.return_value = (
        MagicMock(data=[existing_candidate])
    )
    # Mock duplicate check (none exists yet)
    mock_client.table().select().or_().execute.return_value = MagicMock(data=[])
    # Mock insert
    mock_client.table().insert().execute.return_value = MagicMock(
        data=[
            {
                "id": "cand-pair-1",
                "primary_report_id": cand_id,
                "incoming_report_id": target_id,
                "distance_meters": 11.1,
                "hamming_distance": 1,
                "similarity_pct": 98.44,
                "classification": "strong_duplicate",
                "reason": "Strong visual match",
                "status": "pending",
            }
        ]
    )

    with patch("app.duplicate_service.is_supabase_configured", return_value=True), patch(
        "app.duplicate_service.get_supabase_client", return_value=mock_client
    ):
        result = scan_for_duplicates(target_id)
        assert result["candidates_found"] == 1
        cand = result["candidates"][0]
        assert cand["classification"] == "strong_duplicate"
        assert cand["primary_report_id"] == cand_id
        assert cand["incoming_report_id"] == target_id


def test_review_duplicate_candidate_authorization():
    """Only owners of involved reports or admins can review a duplicate candidate."""
    mock_candidate = {
        "id": "cand-001",
        "primary_report_id": "rep-1",
        "incoming_report_id": "rep-2",
        "primary_report": {"id": "rep-1", "user_id": CITIZEN_1_UUID},
        "incoming_report": {"id": "rep-2", "user_id": CITIZEN_2_UUID},
        "status": "pending",
    }

    mock_client = MagicMock()
    mock_client.table().select().eq().execute.return_value = MagicMock(
        data=[mock_candidate]
    )
    mock_client.table().update().eq().execute.return_value = MagicMock(
        data=[{**mock_candidate, "status": "confirmed"}]
    )

    with patch("app.duplicate_service.is_supabase_configured", return_value=True), patch(
        "app.duplicate_service.get_supabase_client", return_value=mock_client
    ):
        # 1. Citizen 1 (primary owner) CAN review
        res1 = review_duplicate_candidate(
            "cand-001", "confirmed", reviewer_user_id=CITIZEN_1_UUID, client=mock_client
        )
        assert res1["status"] == "confirmed"

        # 2. Citizen 2 (incoming owner) CAN review
        res2 = review_duplicate_candidate(
            "cand-001", "rejected", reviewer_user_id=CITIZEN_2_UUID, client=mock_client
        )
        assert res2 is not None

        # 3. Citizen 3 (uninvolved citizen) CANNOT review -> PermissionError
        with pytest.raises(PermissionError, match="Forbidden"):
            review_duplicate_candidate(
                "cand-001", "confirmed", reviewer_user_id=CITIZEN_3_UUID, client=mock_client
            )

        # 4. Admin CAN review even if not an owner
        res_admin = review_duplicate_candidate(
            "cand-001", "confirmed", reviewer_user_id=CITIZEN_3_UUID, is_admin=True, client=mock_client
        )
        assert res_admin is not None


def test_review_duplicate_candidate_stores_notes_and_reviewer():
    """Reviewing a candidate must store review_notes and reviewed_by in Supabase and mock store."""
    mock_candidate = {
        "id": "cand-001",
        "primary_report_id": "rep-1",
        "incoming_report_id": "rep-2",
        "primary_report": {"id": "rep-1", "user_id": CITIZEN_1_UUID},
        "incoming_report": {"id": "rep-2", "user_id": CITIZEN_2_UUID},
        "status": "pending",
    }

    mock_client = MagicMock()
    mock_client.table().select().eq().execute.return_value = MagicMock(
        data=[mock_candidate]
    )
    mock_client.table().update().eq().execute.return_value = MagicMock(
        data=[
            {
                **mock_candidate,
                "status": "confirmed",
                "review_notes": "Hazard merged",
                "reviewed_by": CITIZEN_1_UUID,
            }
        ]
    )

    with patch("app.duplicate_service.is_supabase_configured", return_value=True), patch(
        "app.duplicate_service.get_supabase_client", return_value=mock_client
    ):
        res = review_duplicate_candidate(
            "cand-001",
            "confirmed",
            reviewer_user_id=CITIZEN_1_UUID,
            review_notes="Hazard merged",
            client=mock_client,
        )
        assert res["status"] == "confirmed"
        # Check that table().update() was called with update_data containing review_notes and reviewed_by
        update_call = mock_client.table().update.call_args
        assert update_call is not None
        update_dict = update_call[0][0]
        assert update_dict["review_notes"] == "Hazard merged"
        assert update_dict["reviewed_by"] == CITIZEN_1_UUID
        assert update_dict["status"] == "confirmed"

    # Test in-memory fallback store preserves review fields
    with patch("app.duplicate_service.is_supabase_configured", return_value=False):
        from app.duplicate_service import _MOCK_DUPLICATES_STORE
        _MOCK_DUPLICATES_STORE.clear()
        _MOCK_DUPLICATES_STORE.append(
            {
                "id": "cand-mock-1",
                "primary_report_id": "rep-1",
                "incoming_report_id": "rep-2",
                "status": "pending",
            }
        )
        res_mock = review_duplicate_candidate(
            "cand-mock-1",
            "rejected",
            reviewer_user_id=CITIZEN_1_UUID,
            review_notes="Different crater depth",
            is_admin=True,
        )
        assert res_mock["status"] == "rejected"
        assert res_mock["review_notes"] == "Different crater depth"
        assert res_mock["reviewed_by"] == CITIZEN_1_UUID
        assert _MOCK_DUPLICATES_STORE[0]["review_notes"] == "Different crater depth"
        assert _MOCK_DUPLICATES_STORE[0]["reviewed_by"] == CITIZEN_1_UUID
        _MOCK_DUPLICATES_STORE.clear()


def test_phase4_migration_duplicate_candidates_rls_default_deny():
    """Verify Phase 4 migration enforces default-deny RLS on duplicate_candidates with no direct client policies."""
    from pathlib import Path
    import re

    migration_path = (
        Path(__file__).resolve().parent.parent.parent
        / "supabase"
        / "migrations"
        / "20261113_phase4_duplicate_detection.sql"
    )
    assert migration_path.exists(), f"Migration file not found at {migration_path}"
    sql_content = migration_path.read_text(encoding="utf-8")

    # Strip SQL single-line comments (-- ...) and multi-line comments (/* ... */)
    no_comments = re.sub(r"--.*$", "", sql_content, flags=re.MULTILINE)
    no_comments = re.sub(r"/\*.*?\*/", "", no_comments, flags=re.DOTALL)

    # Normalize whitespace
    statements = [stmt.strip() for stmt in no_comments.split(";") if stmt.strip()]

    # 1. RLS must be explicitly enabled on duplicate_candidates
    has_enable_rls = any(
        re.search(
            r"ALTER\s+TABLE\s+(public\.)?duplicate_candidates\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY",
            stmt,
            re.IGNORECASE,
        )
        for stmt in statements
    )
    assert has_enable_rls, "Migration must execute 'ALTER TABLE public.duplicate_candidates ENABLE ROW LEVEL SECURITY;'"

    # 2. The old direct SELECT policy must be dropped
    has_drop_policy = any(
        re.search(
            r"DROP\s+POLICY\s+(IF\s+EXISTS\s+)?[\"']Authenticated users can view duplicate candidates[\"']\s+ON\s+(public\.)?duplicate_candidates",
            stmt,
            re.IGNORECASE,
        )
        for stmt in statements
    )
    assert has_drop_policy, "Migration must drop the 'Authenticated users can view duplicate candidates' policy"

    # 3. No CREATE POLICY statements must exist for duplicate_candidates
    create_policy_stmts = [
        stmt
        for stmt in statements
        if re.search(r"CREATE\s+POLICY", stmt, re.IGNORECASE)
        and re.search(r"(public\.)?duplicate_candidates", stmt, re.IGNORECASE)
    ]
    assert len(create_policy_stmts) == 0, (
        f"Expected zero CREATE POLICY statements for duplicate_candidates (default deny), but found: {create_policy_stmts}"
    )

    # 4. No GRANT SELECT/INSERT/UPDATE/DELETE to authenticated or anon on duplicate_candidates
    grant_stmts = [
        stmt
        for stmt in statements
        if re.search(r"GRANT\s+(SELECT|INSERT|UPDATE|DELETE|ALL)", stmt, re.IGNORECASE)
        and re.search(r"(public\.)?duplicate_candidates", stmt, re.IGNORECASE)
        and re.search(r"TO\s+(authenticated|anon|public)", stmt, re.IGNORECASE)
    ]
    assert len(grant_stmts) == 0, f"Found unexpected GRANT statements on duplicate_candidates: {grant_stmts}"

    # 5. Schema integrity: table definition must preserve uniqueness, constraints, and foreign keys
    assert re.search(r"CREATE\s+UNIQUE\s+INDEX\s+IF\s+NOT\s+EXISTS\s+idx_unique_candidate_pair", no_comments, re.IGNORECASE)
    assert re.search(r"CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+(public\.)?duplicate_candidates", no_comments, re.IGNORECASE)
    assert re.search(r"primary_report_id\s+UUID\s+NOT\s+NULL\s+REFERENCES\s+(public\.)?reports", no_comments, re.IGNORECASE)
    assert re.search(r"incoming_report_id\s+UUID\s+NOT\s+NULL\s+REFERENCES\s+(public\.)?reports", no_comments, re.IGNORECASE)


def test_backend_service_role_client_used_for_duplicates():
    """Verify backend duplicate service queries table using server-side service role client."""
    from app.supabase_client import TABLE_DUPLICATE_CANDIDATES
    from app.duplicate_service import list_duplicate_candidates

    mock_client = MagicMock()
    mock_client.table().select().order().execute.return_value = MagicMock(data=[])

    with patch("app.duplicate_service.is_supabase_configured", return_value=True), patch(
        "app.duplicate_service.get_supabase_client", return_value=mock_client
    ) as mock_get_client:
        results = list_duplicate_candidates()
        assert results == []
        # Verified that get_supabase_client() is invoked to acquire service-role client
        assert mock_get_client.called
        assert mock_client.table.called
        assert mock_client.table.call_args[0][0] == TABLE_DUPLICATE_CANDIDATES
