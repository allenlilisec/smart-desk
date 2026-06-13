"""Service-to-service authentication seam.

The contract (openapi/insight.yaml) requires `serviceAuth` (Bearer JWT) on all
internal endpoints. This module exposes the injection seam; the current
implementation is a placeholder that validates token presence and relies on
x-user-* headers for the user context. A real JWT signature/audience check must
be swapped in before any non-loopback deployment.

See: [SUP-19](mention://issue/d65361e8-deaa-422d-8e6f-65f17234b02f) (follow-up ticket)
"""
from __future__ import annotations

import logging
import uuid
from typing import Optional

from fastapi import Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.config import settings

logger = logging.getLogger(__name__)

service_auth_scheme = HTTPBearer(auto_error=False)


class ServiceAuthContext:
    """Resolved service token + proxied user identity."""

    def __init__(
        self,
        token: Optional[str],
        user_id: Optional[uuid.UUID],
        roles: list[str],
        org_id: str,
        request_id: Optional[str],
    ):
        self.token = token
        self.user_id = user_id
        self.roles = roles
        self.org_id = org_id
        self.request_id = request_id


async def verify_service_token(
    request: Request,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(service_auth_scheme),
) -> ServiceAuthContext:
    """Validate service token presence and parse proxied identity headers.

    TODO: implement real JWT signature + aud/iss validation. Until then this
    only ensures the Authorization header is present and parses x-user-id.
    """
    token = credentials.credentials if credentials else None
    if not token:
        logger.warning("missing_service_token", extra={"path": request.url.path})
        raise HTTPException(status_code=401, detail="missing service token")

    # Placeholder: real validation belongs here.
    # if not _verify_jwt(token, audience=settings.service_jwt_audience, issuer=settings.service_jwt_issuer):
    #     raise HTTPException(status_code=401, detail="invalid service token")

    user_header = request.headers.get("x-user-id")
    user_id = uuid.UUID(user_header) if user_header else None
    roles_header = request.headers.get("x-user-roles", "")
    roles = [r.strip() for r in roles_header.split(",") if r.strip()]
    org_id = request.headers.get("x-org-id", "default")
    request_id = request.headers.get("x-request-id")

    return ServiceAuthContext(
        token=token,
        user_id=user_id,
        roles=roles,
        org_id=org_id,
        request_id=request_id,
    )


async def require_user(auth: ServiceAuthContext = Depends(verify_service_token)) -> uuid.UUID:
    """Dependency that returns the proxied user id."""
    if auth.user_id is None:
        raise HTTPException(status_code=401, detail="missing x-user-id")
    return auth.user_id
