"""Civic Priority Engine for Pothole Reporter (Phase 5).

Calculates explainable, deterministic civic priority scores (0 to 100)
combining citizen hazard priority, pothole volume, visual defect area ratio,
confirmed citizen duplicate grievance tallies, and defect report age.

This module is purely computational, deterministic, and independently testable
without Supabase database access or network dependencies.
"""

from dataclasses import dataclass
from datetime import datetime, timezone
import math
from typing import Any, Dict, List, Optional, Union

# ---------------------------------------------------------------------------
# Scoring Constants and Weights
# ---------------------------------------------------------------------------

PRIORITY_WEIGHTS: Dict[str, float] = {
    "critical": 40.0,
    "high": 30.0,
    "medium": 20.0,
    "low": 10.0,
}
DEFAULT_PRIORITY_WEIGHT: float = 20.0

MAX_POTHOLE_COUNT_BONUS: float = 20.0
POTHOLE_COUNT_UNIT_SCORE: float = 5.0

MAX_VISUAL_AREA_BONUS: float = 10.0
VISUAL_AREA_THRESHOLD_HIGH: float = 0.12  # 12% image area ratio -> +10
VISUAL_AREA_THRESHOLD_LOW: float = 0.05   # 5% image area ratio  -> +5

MAX_DUPLICATE_BONUS: float = 20.0
DUPLICATE_UNIT_SCORE: float = 5.0

MAX_AGE_BONUS: float = 10.0
AGE_UNIT_SCORE: float = 1.0  # +1 per full day, max +10


@dataclass(frozen=True)
class PriorityBreakdown:
    """Structured breakdown of factors contributing to the priority score."""

    citizen_priority: float
    pothole_count: float
    visual_area: float
    duplicate_count: float
    report_age: float
    total_score: float

    # Raw telemetry metrics for transparency and explainability
    raw_priority: str
    raw_pothole_count: int
    raw_max_area_ratio: float
    raw_duplicate_count: int
    raw_age_days: int

    def to_dict(self) -> Dict[str, Any]:
        """Convert breakdown to a JSON-serializable dictionary."""
        return {
            "total_score": self.total_score,
            "breakdown": {
                "citizen_priority": self.citizen_priority,
                "pothole_count": self.pothole_count,
                "visual_area": self.visual_area,
                "duplicate_count": self.duplicate_count,
                "report_age": self.report_age,
            },
            "factors": {
                "priority": self.raw_priority,
                "potholes": self.raw_pothole_count,
                "max_box_area_ratio": round(self.raw_max_area_ratio, 4),
                "duplicate_count": self.raw_duplicate_count,
                "age_days": self.raw_age_days,
            },
        }


def extract_max_box_area_ratio(ai_detection: Optional[Union[dict, Any]]) -> float:
    """Extract maximum bounding-box area ratio from persisted ai_detection telemetry.

    Safely handles missing, malformed, or incomplete detection data.
    Missing visual information or missing bounding boxes safely contribute 0.0.

    Does not use raw YOLO confidence or simulated depth.
    """
    if not isinstance(ai_detection, dict):
        return 0.0

    detections = ai_detection.get("detections")
    if not isinstance(detections, list) or len(detections) == 0:
        return 0.0

    # Retrieve image dimensions if present
    img_w = ai_detection.get("image_width") or ai_detection.get("width")
    img_h = ai_detection.get("image_height") or ai_detection.get("height")

    has_valid_dims = False
    total_pixels = 0.0
    try:
        if img_w is not None and img_h is not None:
            w_val = float(img_w)
            h_val = float(img_h)
            if w_val > 0 and h_val > 0:
                total_pixels = w_val * h_val
                has_valid_dims = True
    except (ValueError, TypeError):
        has_valid_dims = False

    max_ratio = 0.0

    for item in detections:
        if not isinstance(item, dict):
            continue

        try:
            x1 = float(item.get("x1", 0.0))
            y1 = float(item.get("y1", 0.0))
            x2 = float(item.get("x2", 0.0))
            y2 = float(item.get("y2", 0.0))

            box_w = max(0.0, x2 - x1)
            box_h = max(0.0, y2 - y1)
            box_area = box_w * box_h

            if has_valid_dims:
                ratio = box_area / total_pixels
            elif 0.0 <= x1 <= 1.0 and 0.0 <= x2 <= 1.0 and 0.0 <= y1 <= 1.0 and 0.0 <= y2 <= 1.0:
                # Pre-normalized coordinate ratios
                ratio = box_area
            else:
                # Pixel coordinates without image dimensions: cannot safely guess ratio
                ratio = 0.0

            if ratio > max_ratio:
                max_ratio = min(ratio, 1.0)
        except (ValueError, TypeError):
            continue

    return max_ratio


def compute_visual_area_score(max_ratio: float) -> float:
    """Evaluate visual area ratio score contribution.

    Rules:
    - +10 at 12% (0.12) or above
    - +5 at 5% (0.05) or above
    - 0 below 5% or when missing
    """
    if max_ratio >= VISUAL_AREA_THRESHOLD_HIGH:
        return 10.0
    if max_ratio >= VISUAL_AREA_THRESHOLD_LOW:
        return 5.0
    return 0.0


def parse_report_age_days(
    created_at: Optional[Union[str, datetime]],
    now: Optional[datetime] = None,
) -> int:
    """Parse report age in full elapsed days (24-hour periods).

    Returns 0 if created_at is missing, malformed, or in the future.
    """
    if created_at is None:
        return 0

    current = now or datetime.now(timezone.utc)

    if isinstance(created_at, datetime):
        dt = created_at
    elif isinstance(created_at, str):
        clean_str = created_at.strip()
        if not clean_str:
            return 0
        try:
            # Handle ISO 'Z' suffix for standard compatibility
            if clean_str.endswith("Z"):
                clean_str = clean_str[:-1] + "+00:00"
            dt = datetime.fromisoformat(clean_str)
        except Exception:
            return 0
    else:
        return 0

    # Ensure tz-aware comparisons in UTC
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    if current.tzinfo is None:
        current = current.replace(tzinfo=timezone.utc)

    delta_seconds = (current - dt).total_seconds()
    if delta_seconds <= 0:
        return 0

    return int(delta_seconds // 86400)


def calculate_priority_score(
    priority: Optional[str] = "medium",
    pothole_count: Optional[int] = 0,
    ai_detection: Optional[dict] = None,
    duplicate_count: Optional[int] = 0,
    created_at: Optional[Union[str, datetime]] = None,
    now: Optional[datetime] = None,
) -> PriorityBreakdown:
    """Calculate the composite civic priority score (0.0 to 100.0) with an explainable breakdown.

    Scoring Rules:
    1. Citizen priority: Critical: 40, High: 30, Medium: 20, Low: 10
    2. Pothole count: +5 per pothole, maximum +20
    3. Maximum bounding-box area ratio: +5 at >=5%, +10 at >=12%
    4. Confirmed duplicate count: +5 per duplicate, maximum +20
    5. Report age: +1 per day, maximum +10

    Returns:
        PriorityBreakdown with factor contributions and bounded total_score (0.0 to 100.0).
    """
    # 1. Citizen Priority
    raw_prio = (priority or "medium").strip().lower()
    citizen_score = PRIORITY_WEIGHTS.get(raw_prio, DEFAULT_PRIORITY_WEIGHT)

    # 2. Pothole Count
    safe_potholes = max(0, int(pothole_count or 0))
    pothole_score = min(float(safe_potholes) * POTHOLE_COUNT_UNIT_SCORE, MAX_POTHOLE_COUNT_BONUS)

    # 3. Maximum Bounding-Box Area Ratio
    max_area_ratio = extract_max_box_area_ratio(ai_detection)
    visual_score = compute_visual_area_score(max_area_ratio)

    # 4. Confirmed Duplicate Count
    safe_duplicates = max(0, int(duplicate_count or 0))
    duplicate_score = min(float(safe_duplicates) * DUPLICATE_UNIT_SCORE, MAX_DUPLICATE_BONUS)

    # 5. Report Age (full days)
    age_days = parse_report_age_days(created_at, now=now)
    age_score = min(float(age_days) * AGE_UNIT_SCORE, MAX_AGE_BONUS)

    # Total score calculation & strict clamping [0.0, 100.0]
    raw_total = citizen_score + pothole_score + visual_score + duplicate_score + age_score
    total_score = round(max(0.0, min(100.0, raw_total)), 2)

    return PriorityBreakdown(
        citizen_priority=citizen_score,
        pothole_count=pothole_score,
        visual_area=visual_score,
        duplicate_count=duplicate_score,
        report_age=age_score,
        total_score=total_score,
        raw_priority=raw_prio,
        raw_pothole_count=safe_potholes,
        raw_max_area_ratio=max_area_ratio,
        raw_duplicate_count=safe_duplicates,
        raw_age_days=age_days,
    )
