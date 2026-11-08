"""FastAPI Authentication Dependency Module for Citizen JWT Verification.

Cryptographically verifies Supabase JWT access tokens via the official Supabase Auth service.
Derives citizen identity directly from the verified token (never trusts client-supplied user IDs).
"""

import logging
from typing import Optional

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from .schemas import AuthenticatedCitizen
from .supabase_client import get_supabase_client, is_supabase_configured

logger = logging.getLogger("pothole_reporter.auth")

# Security scheme for OpenAPI documentation
security = HTTPBearer(auto_error=False)


async def get_current_citizen(
    request: Request,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
) -> AuthenticatedCitizen:
    """FastAPI dependency to verify Supabase JWT token and return the authenticated citizen.

    Raises:
        HTTPException 401: If header is missing, token is malformed, invalid, or expired.
        HTTPException 503: If backend Supabase credentials are not configured.
    """
    auth_header = request.headers.get("Authorization")
    if not auth_header:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required: Missing Authorization header with Bearer token.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    parts = auth_header.strip().split(None, 1)
    if len(parts) == 0 or parts[0].lower() != "bearer":
        scheme = parts[0] if len(parts) > 0 else "None"
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid authentication scheme '{scheme}'. Expected 'Bearer'.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if len(parts) < 2 or not parts[1].strip():
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Malformed Authorization header: Bearer token is empty.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = parts[1].strip()

    if not is_supabase_configured():
        logger.error("Authentication attempted but Supabase backend credentials are not configured in backend/.env.")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Authentication service is unavailable: Supabase credentials not configured in backend/.env.",
        )

    try:
        client = get_supabase_client()
        # Verify token cryptographically against Supabase Auth service.
        # This automatically accounts for signing algorithms (HS256/RS256/ECC) and key rotation.
        response = client.auth.get_user(token)

        if not response or not getattr(response, "user", None):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid or expired token: User could not be verified.",
                headers={"WWW-Authenticate": "Bearer"},
            )

        user = response.user
        user_id = str(user.id)
        email = getattr(user, "email", None)
        role = getattr(user, "role", "authenticated") or "authenticated"
        app_metadata = getattr(user, "app_metadata", {}) or {}
        user_metadata = getattr(user, "user_metadata", {}) or {}

        return AuthenticatedCitizen(
            user_id=user_id,
            email=email,
            role=role,
            app_metadata=app_metadata,
            user_metadata=user_metadata,
        )
    except HTTPException:
        raise
    except Exception as exc:
        logger.warning("Token verification failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Authentication token verification failed: {str(exc)}",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc


async def get_optional_citizen(
    request: Request,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
) -> Optional[AuthenticatedCitizen]:
    """Optional authentication dependency: returns citizen if token is valid, None otherwise."""
    auth_header = request.headers.get("Authorization")
    if not auth_header:
        return None
    try:
        return await get_current_citizen(request, credentials)
    except HTTPException:
        return None
