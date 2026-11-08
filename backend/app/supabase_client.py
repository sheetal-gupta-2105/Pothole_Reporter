"""Supabase Foundation Client Module for Pothole Reporter Backend.

Manages connection to Supabase PostgreSQL database and Storage buckets
using the administrative service_role / secret key.

Security Note:
The SUPABASE_SECRET_KEY possesses administrative privileges and bypasses Row Level Security.
Never expose this key to public clients or commit it to version control.
Never log the raw secret key.
"""

import logging
import os
from typing import Any, Dict, Optional, Tuple

from supabase import Client, create_client

logger = logging.getLogger("pothole_reporter.supabase")

# Storage Bucket and Table Name Constants
BUCKET_POTHOLE_ORIGINALS = "pothole-originals"
BUCKET_POTHOLE_ANNOTATED = "pothole-annotated"
TABLE_REPORTS = "reports"

_supabase_client_instance: Optional[Client] = None
_client_credentials: Optional[Tuple[str, str]] = None


def get_supabase_env_vars() -> Tuple[str, str]:
    """Retrieve Supabase URL and secret key from environment variables."""
    url = os.getenv("SUPABASE_URL", "").strip()
    # Check SUPABASE_SECRET_KEY first, fallback to SUPABASE_SERVICE_ROLE_KEY
    key = os.getenv("SUPABASE_SECRET_KEY", "").strip() or os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip()
    return url, key


def get_supabase_config_status() -> Dict[str, Any]:
    """Validate whether Supabase backend environment variables are set.

    Does NOT expose raw secret keys in the returned status dictionary.
    """
    url, key = get_supabase_env_vars()

    if not url:
        return {
            "is_configured": False,
            "url": None,
            "error_message": "Missing SUPABASE_URL environment variable in backend/.env.",
        }

    if "your-project-id" in url or not url.startswith("http"):
        return {
            "is_configured": False,
            "url": url,
            "error_message": "SUPABASE_URL contains placeholder or invalid format. Must start with https://.",
        }

    if not key:
        return {
            "is_configured": False,
            "url": url,
            "error_message": "Missing SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_ROLE_KEY) in backend/.env.",
        }

    if "your-supabase" in key or "placeholder" in key:
        return {
            "is_configured": False,
            "url": url,
            "error_message": "SUPABASE_SECRET_KEY contains placeholder text. Set your actual service role key.",
        }

    return {
        "is_configured": True,
        "url": url,
        "error_message": None,
    }


def is_supabase_configured() -> bool:
    """Return True if valid Supabase configuration is present in environment."""
    return get_supabase_config_status()["is_configured"]


def reset_supabase_client() -> None:
    """Reset the singleton instance (useful in tests or when env vars change)."""
    global _supabase_client_instance, _client_credentials
    _supabase_client_instance = None
    _client_credentials = None


def get_supabase_client() -> Client:
    """Return the Supabase client singleton using backend secret key.

    Raises:
        RuntimeError: If Supabase environment variables are missing or invalid.
    """
    global _supabase_client_instance, _client_credentials

    status = get_supabase_config_status()
    if not status["is_configured"]:
        raise RuntimeError(
            f"Supabase backend client is not configured: {status['error_message']} "
            "Please configure SUPABASE_URL and SUPABASE_SECRET_KEY in backend/.env. "
            "See backend/.env.example for guidance."
        )

    url, key = get_supabase_env_vars()

    if _supabase_client_instance is not None and _client_credentials == (url, key):
        return _supabase_client_instance

    try:
        _supabase_client_instance = create_client(url, key)
        _client_credentials = (url, key)
        logger.info("Initialized Supabase backend client for URL: %s", url)
        return _supabase_client_instance
    except Exception as exc:
        logger.error("Failed to initialize Supabase client: %s", exc)
        raise RuntimeError(f"Failed to initialize Supabase client: {exc}") from exc


def get_supabase_client_safe() -> Optional[Client]:
    """Return Supabase client if configured, or None without raising an exception."""
    if not is_supabase_configured():
        return None
    try:
        return get_supabase_client()
    except Exception as exc:
        logger.warning("Could not obtain Supabase client: %s", exc)
        return None


def test_supabase_connection() -> Dict[str, Any]:
    """Test live connectivity to Supabase if configured.

    Returns a dictionary indicating status.
    Does not raise exceptions.
    """
    if not is_supabase_configured():
        status = get_supabase_config_status()
        return {
            "connected": False,
            "configured": False,
            "message": status["error_message"],
        }

    try:
        client = get_supabase_client()
        # Query 1 row with limit 0 to check table accessibility and authentication
        res = client.table(TABLE_REPORTS).select("id").limit(1).execute()
        return {
            "connected": True,
            "configured": True,
            "message": f"Successfully queried '{TABLE_REPORTS}' table.",
            "data_count": len(res.data) if res.data else 0,
        }
    except Exception as exc:
        return {
            "connected": False,
            "configured": True,
            "message": f"Connection test failed: {str(exc)}",
        }
