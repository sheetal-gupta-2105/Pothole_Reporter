"""Unit tests for Supabase backend client module."""

import os
import pytest
from app.supabase_client import (
    BUCKET_POTHOLE_ANNOTATED,
    BUCKET_POTHOLE_ORIGINALS,
    TABLE_REPORTS,
    get_supabase_client,
    get_supabase_client_safe,
    get_supabase_config_status,
    is_supabase_configured,
    reset_supabase_client,
    test_supabase_connection as check_supabase_connection,
)


@pytest.fixture(autouse=True)
def clean_client_state():
    """Reset Supabase singleton before and after each test."""
    reset_supabase_client()
    yield
    reset_supabase_client()


def test_supabase_constants():
    """Verify Supabase storage bucket names and table names match setup."""
    assert BUCKET_POTHOLE_ORIGINALS == "pothole-originals"
    assert BUCKET_POTHOLE_ANNOTATED == "pothole-annotated"
    assert TABLE_REPORTS == "reports"


def test_unconfigured_status(monkeypatch):
    """Verify unconfigured status when environment variables are missing."""
    monkeypatch.delenv("SUPABASE_URL", raising=False)
    monkeypatch.delenv("SUPABASE_SECRET_KEY", raising=False)
    monkeypatch.delenv("SUPABASE_SERVICE_ROLE_KEY", raising=False)

    assert not is_supabase_configured()
    status = get_supabase_config_status()
    assert status["is_configured"] is False
    assert "Missing SUPABASE_URL" in status["error_message"]
    assert get_supabase_client_safe() is None


def test_placeholder_url_rejected(monkeypatch):
    """Verify placeholder URL is rejected with informative error."""
    monkeypatch.setenv("SUPABASE_URL", "https://your-project-id.supabase.co")
    monkeypatch.setenv("SUPABASE_SECRET_KEY", "real-looking-key")

    assert not is_supabase_configured()
    status = get_supabase_config_status()
    assert status["is_configured"] is False
    assert "placeholder" in status["error_message"].lower()


def test_missing_secret_key_rejected(monkeypatch):
    """Verify missing secret key is rejected with informative error."""
    monkeypatch.setenv("SUPABASE_URL", "https://xyzcompany.supabase.co")
    monkeypatch.delenv("SUPABASE_SECRET_KEY", raising=False)
    monkeypatch.delenv("SUPABASE_SERVICE_ROLE_KEY", raising=False)

    assert not is_supabase_configured()
    status = get_supabase_config_status()
    assert status["is_configured"] is False
    assert "Missing SUPABASE_SECRET_KEY" in status["error_message"]


def test_placeholder_secret_key_rejected(monkeypatch):
    """Verify placeholder secret key is rejected with informative error."""
    monkeypatch.setenv("SUPABASE_URL", "https://xyzcompany.supabase.co")
    monkeypatch.setenv("SUPABASE_SECRET_KEY", "your-supabase-secret-service-role-key")

    assert not is_supabase_configured()
    status = get_supabase_config_status()
    assert status["is_configured"] is False
    assert "placeholder" in status["error_message"].lower()


def test_unconfigured_client_raises_runtime_error(monkeypatch):
    """Verify get_supabase_client() raises clear RuntimeError when unconfigured."""
    monkeypatch.delenv("SUPABASE_URL", raising=False)
    monkeypatch.delenv("SUPABASE_SECRET_KEY", raising=False)

    with pytest.raises(RuntimeError) as exc_info:
        get_supabase_client()

    assert "Supabase backend client is not configured" in str(exc_info.value)
    assert "backend/.env.example" in str(exc_info.value)


def test_client_initialization_with_valid_config(monkeypatch):
    """Verify Supabase client initializes cleanly when valid configuration is provided."""
    monkeypatch.setenv("SUPABASE_URL", "https://customproject.supabase.co")
    monkeypatch.setenv("SUPABASE_SECRET_KEY", "sbp_valid_service_role_secret_key_12345")

    assert is_supabase_configured()
    status = get_supabase_config_status()
    assert status["is_configured"] is True
    assert status["url"] == "https://customproject.supabase.co"
    assert status["error_message"] is None

    # Initialize client
    client = get_supabase_client()
    assert client is not None
    # Verify singleton caching
    assert get_supabase_client() is client
    assert get_supabase_client_safe() is client


def test_connection_test_when_unconfigured(monkeypatch):
    """Verify test_supabase_connection gracefully reports unconfigured state."""
    monkeypatch.delenv("SUPABASE_URL", raising=False)
    monkeypatch.delenv("SUPABASE_SECRET_KEY", raising=False)

    result = check_supabase_connection()
    assert result["configured"] is False
    assert result["connected"] is False
    assert "Missing SUPABASE_URL" in result["message"]
