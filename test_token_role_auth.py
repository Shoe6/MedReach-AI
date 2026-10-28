"""Verify role enforcement uses the verified Firebase ID token, not client-supplied headers."""
import pytest
from fastapi.testclient import TestClient
from firebase_admin import auth as firebase_auth

from main import app

pytestmark = pytest.mark.real_auth

client = TestClient(app)

PROTECTED = [
    ("get", "/api/dashboard/summary"),
    ("get", "/api/scrubbing-sessions"),
    ("get", "/api/companies/acme/dashboard_metrics"),
    ("post", "/api/companies/acme/users/invite"),
    ("patch", "/api/companies/acme/billing-plan"),
]


@pytest.mark.parametrize(("method", "path"), PROTECTED)
def test_missing_bearer_token_is_rejected_even_with_role_header(method, path):
    response = getattr(client, method)(path, headers={"X-User-Role": "admin"})
    assert response.status_code == 401


def test_invalid_token_is_rejected(monkeypatch):
    def boom(_token):
        raise firebase_auth.InvalidIdTokenError("bad token")

    monkeypatch.setattr(firebase_auth, "verify_id_token", boom)
    response = client.get("/api/scrubbing-sessions", headers={"Authorization": "Bearer nope"})
    assert response.status_code == 401


@pytest.mark.parametrize(
    ("claims", "path", "expected"),
    [
        ({"role": "viewer"}, "/api/scrubbing-sessions", 200),
        ({}, "/api/scrubbing-sessions", 403),
        ({"role": "viewer"}, "/api/companies/acme/billing-plan", 403),
    ],
)
def test_role_claim_in_verified_token_controls_access(monkeypatch, claims, path, expected):
    monkeypatch.setattr(firebase_auth, "verify_id_token", lambda _token: {"uid": "u1", **claims})
    method = "patch" if path.endswith("billing-plan") else "get"
    kwargs = {"json": {"plan": "Pro"}} if method == "patch" else {}
    response = getattr(client, method)(
        path, headers={"Authorization": "Bearer t", "X-User-Role": "admin"}, **kwargs
    )
    assert response.status_code == expected
