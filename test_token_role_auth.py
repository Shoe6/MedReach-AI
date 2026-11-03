"""Verify role enforcement uses the verified Firebase ID token, not client-supplied headers."""
import base64
import json
import os
import subprocess
import sys
from pathlib import Path

import firebase_admin
import pytest
from fastapi.testclient import TestClient
from firebase_admin import auth as firebase_auth

from main import app
from database import FIREBASE_PROJECT_ID

pytestmark = pytest.mark.real_auth

client = TestClient(app)


def test_admin_sdk_uses_production_project():
    assert FIREBASE_PROJECT_ID == "medreachai-679aa"
    assert firebase_admin.get_app().project_id == "medreachai-679aa"


def test_startup_removes_auth_emulator_and_ignores_project_overrides():
    environment = {
        **os.environ,
        "FIREBASE_AUTH_EMULATOR_HOST": "127.0.0.1:9099",
        "FIREBASE_PROJECT_ID": "another-project",
        "GCLOUD_PROJECT": "another-project",
    }
    subprocess.run(
        [
            sys.executable, "-c",
            "import os, database, firebase_admin; "
            "assert 'FIREBASE_AUTH_EMULATOR_HOST' not in os.environ; "
            "assert firebase_admin.get_app().project_id == 'medreachai-679aa'",
        ],
        cwd=Path(__file__).parent,
        env=environment,
        check=True,
        timeout=30,
    )


def test_cross_project_token_is_rejected_before_signature_lookup():
    def encode(value):
        return base64.urlsafe_b64encode(json.dumps(value).encode()).rstrip(b"=").decode()

    token = ".".join([
        encode({"alg": "RS256", "kid": "test-key", "typ": "JWT"}),
        encode({
            "aud": "another-project", "iss": "https://securetoken.google.com/another-project",
            "sub": "other-user", "iat": 1, "exp": 9999999999,
        }),
        encode("invalid-signature"),
    ])
    response = client.get("/api/scrubbing-sessions", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 401
    assert "aud" in response.json()["detail"]


@pytest.mark.parametrize("project", ["medreachai-679aa", "another-project"])
def test_unsigned_emulator_tokens_are_rejected(project):
    def encode(value):
        return base64.urlsafe_b64encode(json.dumps(value).encode()).rstrip(b"=").decode()

    token = ".".join([
        encode({"alg": "none", "typ": "JWT"}),
        encode({
            "aud": project, "iss": f"https://securetoken.google.com/{project}",
            "sub": "emulator-user", "role": "admin", "iat": 1, "exp": 9999999999,
        }),
        "",
    ])
    response = client.get("/api/scrubbing-sessions", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 401


def test_runtime_emulator_override_cannot_disable_signature_verification(monkeypatch):
    monkeypatch.setenv("FIREBASE_AUTH_EMULATOR_HOST", "127.0.0.1:9099")
    response = client.get("/api/scrubbing-sessions", headers={"Authorization": "Bearer token"})
    assert response.status_code == 503

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


@pytest.mark.parametrize(
    "path", ["/api/dashboard/summary", "/api/companies/acme/dashboard_metrics"]
)
@pytest.mark.parametrize("claims", [{}, {"role": "viewer"}, {"role": "unknown"}])
def test_dashboard_metrics_only_require_authenticated_user(monkeypatch, path, claims):
    import main

    class _EmptyCollection:
        def where(self, *args, **kwargs):
            return self

        def limit(self, *args, **kwargs):
            return self

        def stream(self, *args, **kwargs):
            return iter(())

        def document(self, *args, **kwargs):
            return self

        def collection(self, *args, **kwargs):
            return self

        def get(self, *args, **kwargs):
            class _Snap:
                exists = False

                def to_dict(self):
                    return {}

            return _Snap()

    class _EmptyDb:
        def collection(self, *args, **kwargs):
            return _EmptyCollection()

        def collection_group(self, *args, **kwargs):
            return _EmptyCollection()

    monkeypatch.setattr(main, "db", _EmptyDb())
    monkeypatch.setattr(firebase_auth, "verify_id_token", lambda _token: {"uid": "u1", **claims})
    token_header = " ".join(["Bearer", "valid-test-token"])
    response = client.get(path, headers={"Authorization": token_header})
    assert response.status_code == 200, response.text
