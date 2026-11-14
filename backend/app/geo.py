"""Geographic Intelligence Module for Pothole Reporter.

Provides high-precision Haversine distance calculations, coordinate validation,
and bounding-box spatial pre-filtering for civic defect deduplication.
"""

import math
from typing import Tuple

# WGS84 Earth mean radius in meters
EARTH_RADIUS_METERS = 6_371_000.0

# Degrees to meters approximation at the equator
METERS_PER_DEGREE_LATITUDE = 111_320.0


def validate_coordinates(latitude: float, longitude: float) -> Tuple[float, float]:
    """Validate latitude and longitude values against WGS84 bounds.

    Args:
        latitude: Latitude in decimal degrees (-90.0 to 90.0).
        longitude: Longitude in decimal degrees (-180.0 to 180.0).

    Returns:
        Tuple of (latitude, longitude) as validated floats.

    Raises:
        ValueError: If coordinates are non-numeric, NaN, infinite, or out of bounds.
    """
    if not isinstance(latitude, (int, float)) or not isinstance(longitude, (int, float)):
        raise ValueError(
            f"Coordinates must be numeric values. Received latitude={type(latitude).__name__}, "
            f"longitude={type(longitude).__name__}."
        )

    lat = float(latitude)
    lon = float(longitude)

    if math.isnan(lat) or math.isnan(lon):
        raise ValueError(f"Coordinates cannot be NaN. Received latitude={lat}, longitude={lon}.")

    if math.isinf(lat) or math.isinf(lon):
        raise ValueError(f"Coordinates cannot be infinite. Received latitude={lat}, longitude={lon}.")

    if not (-90.0 <= lat <= 90.0):
        raise ValueError(f"Latitude out of bounds [-90.0, 90.0]. Received {lat}.")

    if not (-180.0 <= lon <= 180.0):
        raise ValueError(f"Longitude out of bounds [-180.0, 180.0]. Received {lon}.")

    return lat, lon


def haversine_distance_meters(
    lat1: float,
    lon1: float,
    lat2: float,
    lon2: float,
) -> float:
    """Calculate great-circle distance between two points on Earth using Haversine formula.

    Handles edge cases including identical coordinates, antipodal points, and poles.

    Args:
        lat1: Latitude of point 1 in degrees.
        lon1: Longitude of point 1 in degrees.
        lat2: Latitude of point 2 in degrees.
        lon2: Longitude of point 2 in degrees.

    Returns:
        Distance in meters, rounded to two decimal places.
    """
    lat1_val, lon1_val = validate_coordinates(lat1, lon1)
    lat2_val, lon2_val = validate_coordinates(lat2, lon2)

    # Identical coordinates
    if lat1_val == lat2_val and lon1_val == lon2_val:
        return 0.0

    phi1 = math.radians(lat1_val)
    phi2 = math.radians(lat2_val)
    delta_phi = math.radians(lat2_val - lat1_val)
    delta_lambda = math.radians(lon2_val - lon1_val)

    # Haversine formula
    sin_half_dphi = math.sin(delta_phi / 2.0)
    sin_half_dlambda = math.sin(delta_lambda / 2.0)

    a = (
        sin_half_dphi * sin_half_dphi
        + math.cos(phi1) * math.cos(phi2) * sin_half_dlambda * sin_half_dlambda
    )

    # Numerical safeguard against floating-point inaccuracies
    a = min(1.0, max(0.0, a))

    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
    distance = EARTH_RADIUS_METERS * c

    return round(distance, 2)


def bounding_box_for_radius(
    latitude: float,
    longitude: float,
    radius_meters: float,
) -> Tuple[float, float, float, float]:
    """Calculate a bounding box (min_lat, max_lat, min_lon, max_lon) for spatial pre-filtering.

    Enables fast spatial queries in PostgreSQL via indexed range lookups
    before performing precise Haversine calculations.

    Args:
        latitude: Center latitude in degrees.
        longitude: Center longitude in degrees.
        radius_meters: Search radius in meters (must be > 0).

    Returns:
        Tuple of (min_latitude, max_latitude, min_longitude, max_longitude).
    """
    lat, lon = validate_coordinates(latitude, longitude)

    if radius_meters <= 0:
        raise ValueError(f"Search radius must be positive. Received {radius_meters}.")

    delta_lat = radius_meters / METERS_PER_DEGREE_LATITUDE

    # Longitude delta depends on latitude
    cos_lat = math.cos(math.radians(lat))
    if abs(cos_lat) > 1e-6:
        delta_lon = radius_meters / (METERS_PER_DEGREE_LATITUDE * cos_lat)
    else:
        # Near poles
        delta_lon = 180.0

    min_lat = max(-90.0, lat - delta_lat)
    max_lat = min(90.0, lat + delta_lat)
    min_lon = max(-180.0, lon - delta_lon)
    max_lon = min(180.0, lon + delta_lon)

    return (
        round(min_lat, 6),
        round(max_lat, 6),
        round(min_lon, 6),
        round(max_lon, 6),
    )
