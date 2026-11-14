"""Duplicate Detection Service for Pothole Reporter (Phase 4).

Combines Haversine geographic proximity with perceptual image hashing (pHash)
to identify, classify, and persist duplicate road defect reports.
"""

from datetime import datetime, timezone
import logging
import os
from typing import Any, Dict, List, Optional, Tuple
import uuid

from .geo import haversine_distance_meters, bounding_box_for_radius
from .phash import compute_phash, hamming_distance, similarity_percentage
from .supabase_client import (
    get_supabase_client,
    is_supabase_configured,
    TABLE_REPORTS,
    TABLE_DUPLICATE_CANDIDATES,
    BUCKET_POTHOLE_ORIGINALS,
)

logger = logging.getLogger("pothole_reporter.duplicates")

# Configurable thresholds
DEFAULT_CANDIDATE_RADIUS_METERS = float(
    os.getenv("DUPLICATE_SEARCH_RADIUS_METERS", "50.0")
)
STRONG_HAMMING_THRESHOLD = int(os.getenv("STRONG_HAMMING_THRESHOLD", "10"))
POSSIBLE_HAMMING_THRESHOLD = int(os.getenv("POSSIBLE_HAMMING_THRESHOLD", "20"))

# In-memory candidate fallback for unconfigured environments / isolated testing
_MOCK_DUPLICATES_STORE: List[Dict[str, Any]] = []


def reset_mock_duplicates_store() -> None:
    """Clear in-memory mock duplicates store (used for tests)."""
    global _MOCK_DUPLICATES_STORE
    _MOCK_DUPLICATES_STORE.clear()


def classify_duplicate(
    distance_meters: float,
    hamming_dist: Optional[int],
    radius_meters: float = DEFAULT_CANDIDATE_RADIUS_METERS,
    strong_hamming: int = STRONG_HAMMING_THRESHOLD,
    possible_hamming: int = POSSIBLE_HAMMING_THRESHOLD,
) -> Tuple[str, str, Optional[float]]:
    """Classify relationship between two pothole reports based on spatial and visual evidence.

    Returns:
        Tuple of (classification, reason, similarity_percentage).
        Classification is one of: 'strong_duplicate', 'possible_duplicate', 'not_duplicate'.
    """
    if distance_meters > radius_meters:
        return (
            "not_duplicate",
            f"Geographically separated by {distance_meters:.1f}m (exceeds {radius_meters:.0f}m search radius).",
            None,
        )

    if hamming_dist is None:
        return (
            "possible_duplicate",
            f"Spatial proximity ({distance_meters:.1f}m within {radius_meters:.0f}m radius). Image hash unavailable for visual verification.",
            None,
        )

    sim_pct = similarity_percentage(hamming_dist)

    if hamming_dist <= strong_hamming:
        return (
            "strong_duplicate",
            f"Strong visual match ({sim_pct:.1f}% similarity, Hamming distance {hamming_dist}/64) with close physical proximity ({distance_meters:.1f}m).",
            sim_pct,
        )

    if hamming_dist <= possible_hamming:
        return (
            "possible_duplicate",
            f"Close physical proximity ({distance_meters:.1f}m) with moderate visual correlation ({sim_pct:.1f}% similarity, Hamming distance {hamming_dist}/64).",
            sim_pct,
        )

    return (
        "not_duplicate",
        f"Spatial proximity ({distance_meters:.1f}m), but visual features indicate distinct road defects ({sim_pct:.1f}% similarity, Hamming distance {hamming_dist}/64).",
        sim_pct,
    )


def ensure_report_phash(
    report: Dict[str, Any],
    client: Optional[Any] = None,
    image_bytes: Optional[bytes] = None,
) -> Optional[str]:
    """Retrieve or compute the 64-bit perceptual hash for a report's original photograph.

    If phash is missing and image is available in private storage, securely downloads
    and persists the computed phash back to public.reports.
    """
    existing_phash = report.get("phash")
    if existing_phash:
        return str(existing_phash)

    # 1. Compute from provided direct image bytes
    if image_bytes:
        try:
            computed = compute_phash(image_bytes, cache_key=report.get("image_path"))
            report["phash"] = computed
            if client and report.get("id"):
                try:
                    client.table(TABLE_REPORTS).update({"phash": computed}).eq(
                        "id", report["id"]
                    ).execute()
                except Exception as update_err:
                    logger.warning("Failed to persist phash to report %s: %s", report["id"], update_err)
            return computed
        except Exception as exc:
            logger.error("Failed to compute pHash from image bytes for report %s: %s", report.get("id"), exc)
            return None

    # 2. Download from private storage bucket using service role client
    image_path = report.get("image_path")
    if not image_path or not isinstance(image_path, str) or not client:
        return None

    # Validate image path ownership: must strictly start with the trusted owner UUID followed by '/'
    expected_owner = str(report.get("user_id") or "").strip()
    if not expected_owner or not image_path.startswith(f"{expected_owner}/"):
        logger.warning(
            "Storage path '%s' rejected: does not match report owner '%s' for report %s; skipping image download.",
            image_path,
            expected_owner,
            report.get("id"),
        )
        return None

    try:
        data = client.storage.from_(BUCKET_POTHOLE_ORIGINALS).download(image_path)
        if not data:
            logger.warning("No data downloaded from storage path %s", image_path)
            return None

        computed = compute_phash(data, cache_key=image_path)
        report["phash"] = computed
        if report.get("id"):
            try:
                client.table(TABLE_REPORTS).update({"phash": computed}).eq(
                    "id", report["id"]
                ).execute()
            except Exception as update_err:
                logger.warning("Failed to persist phash to report %s: %s", report["id"], update_err)
        return computed
    except Exception as exc:
        logger.warning("Could not download or hash image from path %s: %s", image_path, exc)
        return None


def get_canonical_pair(
    report_a: Dict[str, Any], report_b: Dict[str, Any]
) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    """Determine primary and incoming reports based on creation timestamp and ID ordering.

    The earlier reported issue is treated as the primary ticket.
    """
    time_a = report_a.get("created_at") or ""
    time_b = report_b.get("created_at") or ""

    if time_a and time_b:
        if time_a <= time_b:
            return report_a, report_b
        return report_b, report_a

    # Fallback to lexical ID order
    if str(report_a.get("id")) <= str(report_b.get("id")):
        return report_a, report_b
    return report_b, report_a


def scan_for_duplicates(
    report_id: str,
    image_bytes: Optional[bytes] = None,
    candidate_radius: float = DEFAULT_CANDIDATE_RADIUS_METERS,
) -> Dict[str, Any]:
    """Scan city-wide reports for duplicates against a target report.

    Combines Haversine spatial proximity with pHash visual similarity.
    Creates and persists duplicate candidate records for strong and possible duplicates.
    """
    if not is_supabase_configured():
        logger.info("Supabase unconfigured; returning mock candidate list.")
        return {
            "report_id": report_id,
            "candidates_found": len(_MOCK_DUPLICATES_STORE),
            "candidates": _MOCK_DUPLICATES_STORE,
            "phash": None,
        }

    client = get_supabase_client()

    # 1. Fetch target report
    res_target = client.table(TABLE_REPORTS).select("*").eq("id", report_id).execute()
    if not res_target.data:
        raise ValueError(f"Report with ID '{report_id}' not found.")

    target_report = res_target.data[0]
    target_lat = float(target_report["latitude"])
    target_lon = float(target_report["longitude"])

    # 2. Ensure target report has a pHash
    target_phash = ensure_report_phash(target_report, client=client, image_bytes=image_bytes)

    # 3. Spatial pre-filtering: compute bounding box
    min_lat, max_lat, min_lon, max_lon = bounding_box_for_radius(
        target_lat, target_lon, candidate_radius
    )

    # 4. Fetch candidate reports within spatial bounding box
    # Exclude the report itself to prevent self-comparison
    spatial_query = (
        client.table(TABLE_REPORTS)
        .select("*")
        .neq("id", report_id)
        .gte("latitude", min_lat)
        .lte("latitude", max_lat)
        .gte("longitude", min_lon)
        .lte("longitude", max_lon)
    )
    spatial_res = spatial_query.execute()
    candidates_in_box = spatial_res.data or []

    found_candidates: List[Dict[str, Any]] = []

    for cand_report in candidates_in_box:
        cand_id = cand_report["id"]
        # Double check self-comparison guard
        if cand_id == report_id:
            continue

        cand_lat = float(cand_report["latitude"])
        cand_lon = float(cand_report["longitude"])

        # High-precision Haversine distance
        dist_meters = haversine_distance_meters(target_lat, target_lon, cand_lat, cand_lon)
        if dist_meters > candidate_radius:
            continue

        # Get or compute candidate pHash
        cand_phash = ensure_report_phash(cand_report, client=client)

        hamming_dist: Optional[int] = None
        if target_phash and cand_phash:
            try:
                hamming_dist = hamming_distance(target_phash, cand_phash)
            except Exception as e:
                logger.warning("Error calculating Hamming distance: %s", e)

        classification, reason, sim_pct = classify_duplicate(
            dist_meters, hamming_dist, radius_meters=candidate_radius
        )

        # Do not persist non-duplicates
        if classification == "not_duplicate":
            continue

        # Canonical ordering: earlier report is primary
        primary_rep, incoming_rep = get_canonical_pair(target_report, cand_report)
        primary_id = primary_rep["id"]
        incoming_id = incoming_rep["id"]

        # Check if candidate pair already exists (either direction)
        existing_res = (
            client.table(TABLE_DUPLICATE_CANDIDATES)
            .select("*")
            .or_(
                f"and(primary_report_id.eq.{primary_id},incoming_report_id.eq.{incoming_id}),"
                f"and(primary_report_id.eq.{incoming_id},incoming_report_id.eq.{primary_id})"
            )
            .execute()
        )

        if existing_res.data and len(existing_res.data) > 0:
            existing_row = existing_res.data[0]
            existing_row["primary_report"] = primary_rep
            existing_row["incoming_report"] = incoming_rep
            found_candidates.append(existing_row)
            continue

        candidate_id = str(uuid.uuid4())
        candidate_row = {
            "id": candidate_id,
            "primary_report_id": primary_id,
            "incoming_report_id": incoming_id,
            "distance_meters": dist_meters,
            "hamming_distance": hamming_dist,
            "similarity_pct": sim_pct,
            "classification": classification,
            "reason": reason,
            "status": "pending",
            "created_at": datetime.now(timezone.utc).isoformat(),
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }

        try:
            inserted = (
                client.table(TABLE_DUPLICATE_CANDIDATES)
                .insert(candidate_row)
                .execute()
            )
            if inserted.data:
                record = inserted.data[0]
                record["primary_report"] = primary_rep
                record["incoming_report"] = incoming_rep
                found_candidates.append(record)
        except Exception as insert_err:
            logger.error("Failed to insert candidate pair (%s, %s): %s", primary_id, incoming_id, insert_err)

    return {
        "report_id": report_id,
        "candidates_found": len(found_candidates),
        "candidates": found_candidates,
        "phash": target_phash,
    }


def list_duplicate_candidates(
    status_filter: Optional[str] = None,
    client: Optional[Any] = None,
) -> List[Dict[str, Any]]:
    """List duplicate candidate pairs with joined report metadata."""
    if not is_supabase_configured():
        if status_filter and status_filter != "all":
            return [c for c in _MOCK_DUPLICATES_STORE if c.get("status") == status_filter]
        return list(_MOCK_DUPLICATES_STORE)

    db_client = client or get_supabase_client()
    query = (
        db_client.table(TABLE_DUPLICATE_CANDIDATES)
        .select("*, primary_report:reports!primary_report_id(*), incoming_report:reports!incoming_report_id(*)")
        .order("created_at", desc=True)
    )

    if status_filter and status_filter != "all":
        query = query.eq("status", status_filter)

    res = query.execute()
    return res.data or []


def review_duplicate_candidate(
    candidate_id: str,
    new_status: str,
    reviewer_user_id: str,
    review_notes: Optional[str] = None,
    is_admin: bool = False,
    client: Optional[Any] = None,
) -> Dict[str, Any]:
    """Review a duplicate candidate pair (confirm or reject).

    Authorization check:
    A citizen may only review a duplicate candidate if they filed either the primary
    or the incoming report, unless they hold an administrative role.
    """
    if new_status not in ("confirmed", "rejected"):
        raise ValueError(f"Invalid review status '{new_status}'. Allowed: confirmed, rejected.")

    if not is_supabase_configured():
        # In-memory mock review
        for c in _MOCK_DUPLICATES_STORE:
            if c["id"] == candidate_id:
                c["status"] = new_status
                c["reviewed_at"] = datetime.now(timezone.utc).isoformat()
                c["reviewed_by"] = reviewer_user_id
                c["review_notes"] = review_notes
                return c
        raise ValueError(f"Duplicate candidate '{candidate_id}' not found.")

    db_client = client or get_supabase_client()

    # 1. Fetch candidate record
    res = (
        db_client.table(TABLE_DUPLICATE_CANDIDATES)
        .select("*, primary_report:reports!primary_report_id(*), incoming_report:reports!incoming_report_id(*)")
        .eq("id", candidate_id)
        .execute()
    )

    if not res.data:
        raise ValueError(f"Duplicate candidate '{candidate_id}' not found.")

    candidate = res.data[0]
    primary_report = candidate.get("primary_report") or {}
    incoming_report = candidate.get("incoming_report") or {}

    primary_owner = primary_report.get("user_id")
    incoming_owner = incoming_report.get("user_id")

    # 2. Authorization verification
    if not is_admin and reviewer_user_id not in (primary_owner, incoming_owner):
        raise PermissionError(
            "Forbidden: You can only review duplicate candidates for reports that you submitted."
        )

    # 3. Update candidate
    now_iso = datetime.now(timezone.utc).isoformat()
    update_data = {
        "status": new_status,
        "reviewed_at": now_iso,
        "reviewed_by": reviewer_user_id,
        "review_notes": review_notes,
        "updated_at": now_iso,
    }

    updated_res = (
        db_client.table(TABLE_DUPLICATE_CANDIDATES)
        .update(update_data)
        .eq("id", candidate_id)
        .execute()
    )

    if not updated_res.data:
        raise RuntimeError(f"Failed to update duplicate candidate '{candidate_id}'.")

    result = updated_res.data[0]
    result["primary_report"] = primary_report
    result["incoming_report"] = incoming_report
    return result
