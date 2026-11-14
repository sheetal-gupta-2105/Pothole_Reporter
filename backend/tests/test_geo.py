"""Unit tests for Geographic Intelligence Module (Haversine formula & validation)."""

import math
import pytest
from app.geo import (
    validate_coordinates,
    haversine_distance_meters,
    bounding_box_for_radius,
)


def test_validate_coordinates_valid():
    """Valid WGS84 coordinates should pass validation."""
    lat, lon = validate_coordinates(12.9716, 77.5946)
    assert lat == 12.9716
    assert lon == 77.5946

    # Extreme bounds
    assert validate_coordinates(90.0, 180.0) == (90.0, 180.0)
    assert validate_coordinates(-90.0, -180.0) == (-90.0, -180.0)
    assert validate_coordinates(0.0, 0.0) == (0.0, 0.0)


@pytest.mark.parametrize(
    "lat,lon,expected_error",
    [
        (91.0, 77.0, "Latitude out of bounds"),
        (-90.1, 77.0, "Latitude out of bounds"),
        (12.0, 180.1, "Longitude out of bounds"),
        (12.0, -180.1, "Longitude out of bounds"),
        (float("nan"), 77.0, "cannot be NaN"),
        (12.0, float("nan"), "cannot be NaN"),
        (float("inf"), 77.0, "cannot be infinite"),
        (12.0, float("-inf"), "cannot be infinite"),
        ("12.9", 77.0, "must be numeric values"),
        (None, 77.0, "must be numeric values"),
    ],
)
def test_validate_coordinates_invalid(lat, lon, expected_error):
    """Invalid coordinates must raise ValueError with clear descriptive messages."""
    with pytest.raises(ValueError, match=expected_error):
        validate_coordinates(lat, lon)


def test_haversine_distance_identical_points():
    """Distance between identical coordinates must be exactly 0.0 meters."""
    dist = haversine_distance_meters(12.9716, 77.5946, 12.9716, 77.5946)
    assert dist == 0.0


def test_haversine_distance_known_bengaluru_locations():
    """Distance between Vidhana Soudha and Indiranagar 100ft Rd is approx 4.8 km."""
    # Vidhana Soudha: 12.9797, 77.5907
    # Indiranagar 100ft Rd: 12.9784, 77.6408
    dist = haversine_distance_meters(12.9797, 77.5907, 12.9784, 77.6408)
    assert 5300 < dist < 5600  # ~5.43 km


def test_haversine_distance_short_spatial_radius():
    """Verify high-precision distance for points separated by ~25-50 meters."""
    # 0.00027 degrees latitude is approx 30 meters
    lat1 = 12.935240
    lon1 = 77.624500
    lat2 = 12.935510
    lon2 = 77.624500

    dist = haversine_distance_meters(lat1, lon1, lat2, lon2)
    assert 29.0 <= dist <= 31.0


def test_haversine_distance_antipodal():
    """Antipodal points should equal approximately half the Earth's circumference (~20,015 km)."""
    dist = haversine_distance_meters(0.0, 0.0, 0.0, 180.0)
    assert 20_000_000 <= dist <= 20_050_000


def test_haversine_distance_poles():
    """Distance between North Pole and South Pole is approx 20,015 km."""
    dist = haversine_distance_meters(90.0, 0.0, -90.0, 0.0)
    assert 20_000_000 <= dist <= 20_050_000


def test_bounding_box_for_radius_50m():
    """50-meter bounding box in Bengaluru should produce correct lat/lon ranges."""
    lat, lon = 12.9716, 77.5946
    min_lat, max_lat, min_lon, max_lon = bounding_box_for_radius(lat, lon, 50.0)

    assert min_lat < lat < max_lat
    assert min_lon < lon < max_lon

    # Verify that point at (max_lat, lon) is approximately 50m away
    dist_lat = haversine_distance_meters(lat, lon, max_lat, lon)
    assert 48.0 <= dist_lat <= 52.0


def test_bounding_box_invalid_radius():
    """Zero or negative radius must raise ValueError."""
    with pytest.raises(ValueError, match="must be positive"):
        bounding_box_for_radius(12.9716, 77.5946, 0.0)

    with pytest.raises(ValueError, match="must be positive"):
        bounding_box_for_radius(12.9716, 77.5946, -10.0)
