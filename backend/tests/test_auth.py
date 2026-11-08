"""Unit tests for backend FastAPI citizen JWT verification and authentication dependency."""

from types import SimpleNamespace
from unittest.mock import MagicMock
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.supabase_client import reset_supabase_client

client = TestClient(app)


@pytest.fixture(autouse=True)
def clean_supabase_state():
    """Reset Supabase client before and after each test."""
    reset_supabase_client()
    yield
    reset_supabase_client()


def test_auth_missing_header():
    """Verify request without Authorization header returns 401."""
    response = client.get("/api/auth/me")
    assert response.status_code == 401
    assert "Missing Authorization header" in response.json()["detail"]
    assert response.headers.get("WWW-Authenticate") == "Bearer"


def test_auth_malformed_scheme_rejected():
    """Verify non-Bearer schemes (e.g. Basic, Token) return 401."""
    response = client.get(
        "/api/auth/me",
        headers={"Authorization": "Basic dXNlcjpwYXNz"},
    )
    assert response.status_code == 401
    assert "Expected 'Bearer'" in response.json()["detail"]


def test_auth_empty_bearer_token_rejected():
    """Verify empty Bearer token returns 401."""
    response = client.get(
        "/api/auth/me",
        headers={"Authorization": "Bearer   "},
    )
    assert response.status_code == 401
    assert "Bearer token is empty" in response.json()["detail"]


def test_auth_unconfigured_backend(monkeypatch):
    """Verify request returns 503 when backend Supabase credentials are missing."""
    monkeypatch.delenv("SUPABASE_URL", raising=False)
    monkeypatch.delenv("SUPABASE_SECRET_KEY", raising=False)
    monkeypatch.delenv("SUPABASE_SERVICE_ROLE_KEY", raising=False)

    response = client.get(
        "/api/auth/me",
        headers={"Authorization": "Bearer some.jwt.token"},
    )
    assert response.status_code == 503
    assert "unavailable" in response.json()["detail"].lower()


def test_auth_invalid_token_rejected(monkeypatch):
    """Verify invalid token signature returns 401."""
    monkeypatch.setenv("SUPABASE_URL", "https://mockproject.supabase.co")
    monkeypatch.setenv("SUPABASE_SECRET_KEY", "mock-service-role-key-12345")

    mock_client = MagicMock()
    mock_client.auth.get_user.side_effect = Exception("Invalid token signature")
    monkeypatch.setattr("app.auth.get_supabase_client", lambda: mock_client)

    response = client.get(
        "/api/auth/me",
        headers={"Authorization": "Bearer invalid.token.payload"},
    )
    assert response.status_code == 401
    assert "verification failed" in response.json()["detail"].lower()
    assert response.headers.get("WWW-Authenticate") == "Bearer"


def test_auth_expired_token_rejected(monkeypatch):
    """Verify expired token returns 401."""
    monkeypatch.setenv("SUPABASE_URL", "https://mockproject.supabase.co")
    monkeypatch.setenv("SUPABASE_SECRET_KEY", "mock-service-role-key-12345")

    mock_client = MagicMock()
    mock_client.auth.get_user.side_effect = Exception("Token has expired")
    monkeypatch.setattr("app.auth.get_supabase_client", lambda: mock_client)

    response = client.get(
        "/api/auth/me",
        headers={"Authorization": "Bearer expired.token.payload"},
    )
    assert response.status_code == 401
    assert "verification failed" in response.json()["detail"].lower()
    assert "expired" in response.json()["detail"].lower()


def test_auth_valid_token_derives_user_id(monkeypatch):
    """Verify valid token cryptographically derives citizen identity."""
    monkeypatch.setenv("SUPABASE_URL", "https://mockproject.supabase.co")
    monkeypatch.setenv("SUPABASE_SECRET_KEY", "mock-service-role-key-12345")

    # Mock user object as returned by Supabase Auth service
    mock_user = SimpleNamespace(
        id="citizen-uuid-4242-8888",
        email="citizen@bengaluru.gov.in",
        role="authenticated",
        app_metadata={"provider": "email", "providers": ["email"]},
        user_metadata={"full_name": "Ramesh Gowda", "phone": "+91 98450 12345"},
    )
    mock_response = SimpleNamespace(user=mock_user)

    mock_client = MagicMock()
    mock_client.auth.get_user.return_value = mock_response
    monkeypatch.setattr("app.auth.get_supabase_client", lambda: mock_client)

    response = client.get(
        "/api/auth/me",
        headers={"Authorization": "Bearer valid.verified.jwt"},
    )
    assert response.status_code == 200
    data = response.json()
    # Ensure user_id is derived exclusively from verified token
    assert data["user_id"] == "citizen-uuid-4242-8888"
    assert data["email"] == "citizen@bengaluru.gov.in"
    assert data["role"] == "authenticated"
    assert data["user_metadata"]["full_name"] == "Ramesh Gowda"
    mock_client.auth.get_user.assert_called_once_with("valid.verified.jwt")


def test_existing_endpoints_remain_public():
    """Verify /api/health and /api/detect remain public and functional without auth."""
    health_resp = client.get("/api/health")
    assert health_resp.status_code == 200
    assert health_resp.json()["status"] == "ok"
