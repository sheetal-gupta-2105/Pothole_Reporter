"""Unit tests for Civic Priority Engine (Phase 5.3).

Tests pure priority calculation, factor contributions, bounding-box ratio extraction,
caps, clamping [0, 100], and robust handling of missing or malformed telemetry.
"""

from datetime import datetime, timedelta, timezone
import pytest

from app.priority import (
    calculate_priority_score,
    compute_visual_area_score,
    extract_max_box_area_ratio,
    parse_report_age_days,
    PriorityBreakdown,
)


def test_priority_engine_base_levels():
    """All four base priority levels must map to exact specified scores."""
    # Critical -> 40
    res_crit = calculate_priority_score(priority="critical")
    assert res_crit.citizen_priority == 40.0
    assert res_crit.total_score == 40.0

    # High -> 30
    res_high = calculate_priority_score(priority="high")
    assert res_high.citizen_priority == 30.0
    assert res_high.total_score == 30.0

    # Medium -> 20
    res_med = calculate_priority_score(priority="medium")
    assert res_med.citizen_priority == 20.0
    assert res_med.total_score == 20.0

    # Low -> 10
    res_low = calculate_priority_score(priority="low")
    assert res_low.citizen_priority == 10.0
    assert res_low.total_score == 10.0

    # Case-insensitivity & whitespace trimming
    assert calculate_priority_score(priority="  CRITICAL  ").citizen_priority == 40.0
    assert calculate_priority_score(priority="Low").citizen_priority == 10.0

    # Unrecognized / None falls back to default (Medium: 20)
    assert calculate_priority_score(priority="unknown").citizen_priority == 20.0
    assert calculate_priority_score(priority=None).citizen_priority == 20.0


def test_priority_engine_pothole_count_cap():
    """Pothole count contributes +5 per pothole up to a strict maximum of +20."""
    # 0 potholes -> 0
    assert calculate_priority_score(priority="low", pothole_count=0).pothole_count == 0.0
    # 1 pothole -> 5
    assert calculate_priority_score(priority="low", pothole_count=1).pothole_count == 5.0
    # 2 potholes -> 10
    assert calculate_priority_score(priority="low", pothole_count=2).pothole_count == 10.0
    # 3 potholes -> 15
    assert calculate_priority_score(priority="low", pothole_count=3).pothole_count == 15.0
    # 4 potholes -> 20 (cap reached)
    assert calculate_priority_score(priority="low", pothole_count=4).pothole_count == 20.0
    # 5 potholes -> 20 (capped)
    assert calculate_priority_score(priority="low", pothole_count=5).pothole_count == 20.0
    # 20 potholes -> 20 (capped)
    assert calculate_priority_score(priority="low", pothole_count=20).pothole_count == 20.0
    # Negative potholes -> 0
    assert calculate_priority_score(priority="low", pothole_count=-3).pothole_count == 0.0
    # None -> 0
    assert calculate_priority_score(priority="low", pothole_count=None).pothole_count == 0.0


def test_priority_engine_visual_area_thresholds():
    """Visual area ratio contributes +5 at >=5% (0.05) and +10 at >=12% (0.12)."""
    # Helper to build detection telemetry with specific image and box dimensions
    def make_detection(img_w, img_h, box_w, box_h):
        return {
            "image_width": img_w,
            "image_height": img_h,
            "detections": [
                {
                    "x1": 0.0,
                    "y1": 0.0,
                    "x2": float(box_w),
                    "y2": float(box_h),
                    "confidence": 0.88,
                }
            ],
        }

    # Image: 1000x1000 = 1,000,000 pixels
    # 1. Below 5% (e.g. 200x200 = 40,000 / 1,000,000 = 4%) -> 0 bonus
    det_4pct = make_detection(1000, 1000, 200, 200)
    res_4pct = calculate_priority_score(priority="low", ai_detection=det_4pct)
    assert res_4pct.visual_area == 0.0

    # 2. Exactly 5% (e.g. 200x250 = 50,000 / 1,000,000 = 5%) -> +5 bonus
    det_5pct = make_detection(1000, 1000, 200, 250)
    res_5pct = calculate_priority_score(priority="low", ai_detection=det_5pct)
    assert res_5pct.visual_area == 5.0

    # 3. 8% (between 5% and 12%) -> +5 bonus
    det_8pct = make_detection(1000, 1000, 400, 200)
    res_8pct = calculate_priority_score(priority="low", ai_detection=det_8pct)
    assert res_8pct.visual_area == 5.0

    # 4. Exactly 12% (e.g. 300x400 = 120,000 / 1,000,000 = 12%) -> +10 bonus
    det_12pct = make_detection(1000, 1000, 300, 400)
    res_12pct = calculate_priority_score(priority="low", ai_detection=det_12pct)
    assert res_12pct.visual_area == 10.0

    # 5. 25% (above 12%) -> +10 bonus
    det_25pct = make_detection(1000, 1000, 500, 500)
    res_25pct = calculate_priority_score(priority="low", ai_detection=det_25pct)
    assert res_25pct.visual_area == 10.0


def test_priority_engine_missing_or_malformed_detection_data():
    """Missing or malformed visual telemetry safely contributes 0.0."""
    # None telemetry
    assert calculate_priority_score(priority="low", ai_detection=None).visual_area == 0.0

    # Non-dict telemetry
    assert calculate_priority_score(priority="low", ai_detection="corrupt string").visual_area == 0.0

    # Empty dict
    assert calculate_priority_score(priority="low", ai_detection={}).visual_area == 0.0

    # Detections list empty or missing
    assert calculate_priority_score(priority="low", ai_detection={"detections": []}).visual_area == 0.0
    assert calculate_priority_score(priority="low", ai_detection={"detections": None}).visual_area == 0.0

    # Corrupted detection elements
    corrupt_det = {
        "image_width": 800,
        "image_height": 600,
        "detections": ["not a dict", None, 12345, {"x1": "invalid", "x2": "bad"}],
    }
    assert calculate_priority_score(priority="low", ai_detection=corrupt_det).visual_area == 0.0

    # Missing image dimensions with pixel coordinates (cannot safely infer ratio)
    no_dims_det = {
        "detections": [{"x1": 50, "y1": 50, "x2": 400, "y2": 400}],
    }
    assert calculate_priority_score(priority="low", ai_detection=no_dims_det).visual_area == 0.0


def test_priority_engine_duplicate_count_cap():
    """Confirmed duplicate count contributes +5 per duplicate up to a cap of +20."""
    # 0 duplicates -> 0
    assert calculate_priority_score(priority="low", duplicate_count=0).duplicate_count == 0.0
    # 1 duplicate -> 5
    assert calculate_priority_score(priority="low", duplicate_count=1).duplicate_count == 5.0
    # 2 duplicates -> 10
    assert calculate_priority_score(priority="low", duplicate_count=2).duplicate_count == 10.0
    # 3 duplicates -> 15
    assert calculate_priority_score(priority="low", duplicate_count=3).duplicate_count == 15.0
    # 4 duplicates -> 20 (cap reached)
    assert calculate_priority_score(priority="low", duplicate_count=4).duplicate_count == 20.0
    # 10 duplicates -> 20 (capped)
    assert calculate_priority_score(priority="low", duplicate_count=10).duplicate_count == 20.0
    # Negative duplicates -> 0
    assert calculate_priority_score(priority="low", duplicate_count=-5).duplicate_count == 0.0
    # None -> 0
    assert calculate_priority_score(priority="low", duplicate_count=None).duplicate_count == 0.0


def test_priority_engine_report_age_cap():
    """Report age contributes +1 per full day up to a cap of +10."""
    now = datetime(2026, 11, 16, 12, 0, 0, tzinfo=timezone.utc)

    # 0 days (same day) -> 0
    created_now = now.isoformat()
    assert calculate_priority_score(priority="low", created_at=created_now, now=now).report_age == 0.0

    # 1 day old -> +1
    created_1d = (now - timedelta(days=1, hours=1)).isoformat()
    assert calculate_priority_score(priority="low", created_at=created_1d, now=now).report_age == 1.0

    # 5 days old -> +5
    created_5d = (now - timedelta(days=5, hours=2)).isoformat()
    assert calculate_priority_score(priority="low", created_at=created_5d, now=now).report_age == 5.0

    # 10 days old -> +10 (cap reached)
    created_10d = (now - timedelta(days=10)).isoformat()
    assert calculate_priority_score(priority="low", created_at=created_10d, now=now).report_age == 10.0

    # 30 days old -> +10 (capped)
    created_30d = (now - timedelta(days=30)).isoformat()
    assert calculate_priority_score(priority="low", created_at=created_30d, now=now).report_age == 10.0

    # Future date (negative delta) -> 0
    created_future = (now + timedelta(days=2)).isoformat()
    assert calculate_priority_score(priority="low", created_at=created_future, now=now).report_age == 0.0

    # Malformed ISO string -> 0
    assert calculate_priority_score(priority="low", created_at="invalid-date", now=now).report_age == 0.0
    # None -> 0
    assert calculate_priority_score(priority="low", created_at=None, now=now).report_age == 0.0


def test_priority_engine_score_bounds_and_breakdown():
    """Verify maximum bounded score (100.0), minimum bounded score (10.0), and factor breakdown."""
    now = datetime(2026, 11, 16, 12, 0, 0, tzinfo=timezone.utc)

    # Max scenario: Critical (40) + 4 potholes (20) + 12% box (10) + 4 duplicates (20) + 10 days (10) = 100
    large_box = {
        "image_width": 1000,
        "image_height": 1000,
        "detections": [{"x1": 0, "y1": 0, "x2": 400, "y2": 400}],  # 16% > 12%
    }
    old_date = (now - timedelta(days=12)).isoformat()

    res_max = calculate_priority_score(
        priority="critical",
        pothole_count=5,          # capped at 20
        ai_detection=large_box,   # +10
        duplicate_count=6,        # capped at 20
        created_at=old_date,      # capped at 10
        now=now,
    )

    assert res_max.total_score == 100.0
    assert res_max.citizen_priority == 40.0
    assert res_max.pothole_count == 20.0
    assert res_max.visual_area == 10.0
    assert res_max.duplicate_count == 20.0
    assert res_max.report_age == 10.0

    # Verify structured dictionary serialization
    dict_repr = res_max.to_dict()
    assert dict_repr["total_score"] == 100.0
    assert dict_repr["breakdown"]["citizen_priority"] == 40.0
    assert dict_repr["breakdown"]["pothole_count"] == 20.0
    assert dict_repr["breakdown"]["visual_area"] == 10.0
    assert dict_repr["breakdown"]["duplicate_count"] == 20.0
    assert dict_repr["breakdown"]["report_age"] == 10.0
    assert dict_repr["factors"]["priority"] == "critical"
    assert dict_repr["factors"]["potholes"] == 5
    assert dict_repr["factors"]["max_box_area_ratio"] == 0.16
    assert dict_repr["factors"]["duplicate_count"] == 6
    assert dict_repr["factors"]["age_days"] == 12

    # Minimum base scenario: Low priority (10) with zero other factors -> 10.0
    res_min = calculate_priority_score(priority="low")
    assert res_min.total_score == 10.0
    assert 0.0 <= res_min.total_score <= 100.0
