"""Firebase Auth JWT verification and role-based access control dependencies (MA-52)."""

import logging
import os
from typing import Callable, Iterable

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from firebase_admin import auth as firebase_auth
from google.api_core.exceptions import GoogleAPICallError

import database  # ensures firebase_admin app is initialized for the production project

bearer_scheme = HTTPBearer(auto_error=False)
logger = logging.getLogger(__name__)
ROLE_LEVELS = {"viewer": 0, "editor": 1, "admin": 2, "super-admin": 3}
COMPANY_LOOKUP_TIMEOUT_SECONDS = 3.0


def verify_firebase_token(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> dict:
    """Validate the `Authorization: Bearer <token>` header and return the decoded claims."""
    if credentials is None or not credentials.credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing bearer token in Authorization header.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if os.environ.get("FIREBASE_AUTH_EMULATOR_HOST"):
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Firebase Auth emulator mode is not permitted on this backend.",
        )

    try:
        return firebase_auth.verify_id_token(credentials.credentials)
    except (
        firebase_auth.InvalidIdTokenError,
        firebase_auth.ExpiredIdTokenError,
        firebase_auth.RevokedIdTokenError,
        firebase_auth.CertificateFetchError,
        ValueError,
    ) as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid or expired authentication token: {exc}",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc


def require_role(allowed_roles: Iterable[str]) -> Callable[..., dict]:
    """Allow the requested roles and all higher roles in the platform hierarchy."""
    required = frozenset(role.strip().lower() for role in allowed_roles)
    if not required or not required.issubset(ROLE_LEVELS):
        raise ValueError("Role requirements must contain known platform roles.")
    minimum_level = min(ROLE_LEVELS[role] for role in required)
    allowed = frozenset(
        role for role, level in ROLE_LEVELS.items() if level >= minimum_level
    )

    def _check_role(token: dict = Depends(verify_firebase_token)) -> dict:
        role = str(token.get("role") or "").strip().lower()
        if role not in allowed:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=(
                    f"Invalid role '{role or 'none'}': "
                    f"requires one of {', '.join(sorted(allowed))}."
                ),
            )
        return token

    return _check_role


def verify_company_access(
    company_id: str, token: dict = Depends(verify_firebase_token)
) -> dict:
    """Scope users to a signed company claim or, when absent, their user document."""
    if str(token.get("role") or "").strip().lower() == "super-admin":
        return token

    user_company = token.get("company_id")
    if user_company is None:
        uid = token.get("uid") or token.get("sub")
        if not isinstance(uid, str) or not uid.strip():
            raise HTTPException(
                status_code=401, detail="Authenticated user is missing a UID."
            )
        try:
            snapshot = (
                database.db.collection("users")
                .document(uid)
                .get(
                    retry=None,
                    timeout=COMPANY_LOOKUP_TIMEOUT_SECONDS,
                )
            )
        except GoogleAPICallError as exc:
            logger.exception("Unable to verify company access.")
            raise HTTPException(
                status_code=503,
                detail="Unable to verify company access; please try again.",
            ) from exc
        user_company = (
            (snapshot.to_dict() or {}).get("company_id") if snapshot.exists else None
        )

    if (
        not isinstance(user_company, str)
        or not user_company
        or user_company != company_id
    ):
        raise HTTPException(
            status_code=403,
            detail=(
                "Company scope mismatch: the requested company is not assigned "
                "to the authenticated user."
            ),
        )
    return token


def require_company_role(allowed_roles: Iterable[str]) -> Callable[..., dict]:
    """Check role inheritance before validating the company_id path parameter."""
    role_check = require_role(allowed_roles)

    def _check_company(company_id: str, token: dict = Depends(role_check)) -> dict:
        return verify_company_access(company_id, token)

    return _check_company


# Example usage in a FastAPI route:
#
# from auth import require_role
#
# @app.get("/api/data", dependencies=[Depends(require_role(["admin", "super-admin"]))])
# def get_data():
#     ...
