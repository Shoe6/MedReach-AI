"""Firebase Auth JWT verification and role-based access control dependencies (MA-52)."""
from typing import Iterable

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from firebase_admin import auth as firebase_auth

import database  # noqa: F401  (ensures firebase_admin app is initialized)

bearer_scheme = HTTPBearer(auto_error=False)


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

    try:
        return firebase_auth.verify_id_token(credentials.credentials)
    except (firebase_auth.InvalidIdTokenError, firebase_auth.ExpiredIdTokenError,
            firebase_auth.RevokedIdTokenError, firebase_auth.CertificateFetchError, ValueError) as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid or expired authentication token: {exc}",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc


def require_role(allowed_roles: Iterable[str]):
    """Return a dependency that enforces the decoded token's `role` claim is in `allowed_roles`."""
    allowed = frozenset(allowed_roles)

    def _check_role(token: dict = Depends(verify_firebase_token)) -> dict:
        role = token.get("role")
        if role not in allowed:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Role '{role}' is not permitted to access this resource.",
            )
        return token

    return _check_role


# Example usage in a FastAPI route:
#
# from auth import require_role
#
# @app.get("/api/data", dependencies=[Depends(require_role(["Admin", "Super Admin"]))])
# def get_data():
#     ...
