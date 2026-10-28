"""Test-only auth shim.

Most API tests predate the Firebase token migration and identify the caller with an
`X-User-Role` header. This fixture translates that header into verified-token claims so
the real `require_role` dependencies are still exercised. Requests carrying a real
`Authorization: Bearer` header are passed through to the actual token verification, and
tests can still opt out with `@pytest.mark.real_auth`.
"""
import pytest
from fastapi import Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials

import auth
from main import app


def _header_claims(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(auth.bearer_scheme),
) -> dict:
    if credentials is not None:
        return _real_verify(credentials)
    role = request.headers.get("x-user-role")
    if role is None:
        raise HTTPException(status_code=401, detail="Missing bearer token in Authorization header.")
    return {"uid": "test-user", "role": role.strip().lower()}


_real_verify = auth.verify_firebase_token


def pytest_configure(config):
    config.addinivalue_line("markers", "real_auth: do not install the X-User-Role test shim")


@pytest.fixture(autouse=True)
def _role_header_auth(request):
    if request.node.get_closest_marker("real_auth"):
        yield
        return
    previous = app.dependency_overrides.get(auth.verify_firebase_token)
    app.dependency_overrides[auth.verify_firebase_token] = _header_claims
    yield
    if previous is None:
        app.dependency_overrides.pop(auth.verify_firebase_token, None)
    else:
        app.dependency_overrides[auth.verify_firebase_token] = previous
