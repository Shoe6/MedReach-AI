"""Regression coverage for role inheritance and company-scoped API access."""

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from firebase_admin import auth as firebase_auth
from google.api_core.exceptions import ServiceUnavailable

import auth
import main

pytestmark = pytest.mark.real_auth
client = TestClient(main.app)
HEADERS = {"Authorization": "Bearer test-token"}


@pytest.mark.parametrize("role", ["editor", "admin", "super-admin", " Admin "])
def test_editor_requirement_inherits_higher_roles(role):
    token = {"uid": "user-1", "role": role}
    result = auth.require_role(["editor"])(token)
    assert result == {**token, "role": role.strip().lower()}


@pytest.mark.parametrize("role", ["viewer", "unknown", "", None])
def test_editor_requirement_rejects_invalid_roles_clearly(monkeypatch, role):
    user_database(monkeypatch)
    with pytest.raises(HTTPException) as error:
        auth.require_role(["editor"])({"uid": "user-1", "role": role})
    assert error.value.status_code == 403
    assert "Invalid role" in error.value.detail


@pytest.mark.parametrize(
    ("method", "path", "payload"),
    [
        ("post", "/api/companies/acme/uploads/generate-url", {"filename": "data.csv"}),
        ("get", "/api/companies/acme/records", None),
        ("get", "/api/companies/acme/provider_walkthrough", None),
        ("post", "/api/companies/acme/records/merge", {"records": []}),
        ("get", "/api/companies/acme/export_data", None),
        (
            "post",
            "/api/companies/acme/uploads/process",
            {"object_name": "raw_uploads/user-1/data.csv"},
        ),
        ("get", "/api/companies/acme/uploads/process/job-1", None),
        ("post", "/api/companies/acme/flags/approve-low-severity", {}),
        ("patch", "/api/companies/acme/billing-plan", {"plan": "Pro"}),
        (
            "post",
            "/api/companies/acme/users/invite",
            {"email": "new@example.com", "role": "editor"},
        ),
        ("delete", "/api/companies/acme/uploads/upload-1", None),
        ("get", "/api/companies/acme/dashboard_metrics", None),
    ],
)
def test_company_routes_reject_other_tenants(monkeypatch, method, path, payload):
    monkeypatch.setattr(
        firebase_auth,
        "verify_id_token",
        lambda _: {
            "uid": "user-1",
            "role": "admin",
            "company_id": "other-company",
        },
    )
    response = client.request(method, path, headers=HEADERS, json=payload)
    assert response.status_code == 403, response.text
    assert "Company scope mismatch" in response.json()["detail"]


@pytest.mark.parametrize("role", ["viewer", "editor", "admin", "super-admin"])
def test_records_accept_same_company_and_preserve_response(monkeypatch, role):
    monkeypatch.setattr(
        firebase_auth,
        "verify_id_token",
        lambda _: {
            "uid": "user-1",
            "role": role,
            "company_id": "acme",
        },
    )
    response = client.get("/api/companies/acme/records", headers=HEADERS)
    assert response.status_code == 200, response.text
    assert response.json() == {"company_name": "acme", "records": []}


def test_super_admin_retains_cross_company_access(monkeypatch):
    monkeypatch.setattr(
        firebase_auth,
        "verify_id_token",
        lambda _: {
            "uid": "user-1",
            "role": "super-admin",
            "company_id": "other-company",
        },
    )
    response = client.get("/api/companies/acme/records", headers=HEADERS)
    assert response.status_code == 200, response.text


@pytest.mark.parametrize("role", ["editor", "admin", "super-admin"])
def test_upload_signing_accepts_editor_and_higher(monkeypatch, role):
    monkeypatch.setattr(
        firebase_auth,
        "verify_id_token",
        lambda _: {
            "uid": "user-1",
            "role": role,
            "company_id": "acme",
        },
    )
    monkeypatch.setattr(main, "USE_EMULATOR", False)
    monkeypatch.setattr(main, "_iam_signing_kwargs", lambda: {})

    class Blob:
        def generate_signed_url(self, **kwargs):
            return "https://storage.example.test/signed-upload"

    class Bucket:
        def blob(self, object_name):
            assert object_name.startswith("companies/acme/uploads/")
            return Blob()

    monkeypatch.setattr(main.storage, "bucket", lambda: Bucket())
    response = client.post(
        "/api/companies/acme/uploads/generate-url",
        headers=HEADERS,
        json={"filename": "data.csv"},
    )
    assert response.status_code == 200, response.text
    assert response.json()["upload_url"] == "https://storage.example.test/signed-upload"


def test_viewer_upload_reports_role_failure_before_scope(monkeypatch):
    monkeypatch.setattr(
        firebase_auth,
        "verify_id_token",
        lambda _: {
            "uid": "user-1",
            "role": "viewer",
            "company_id": "other-company",
        },
    )
    response = client.post(
        "/api/companies/acme/uploads/generate-url",
        headers=HEADERS,
        json={"filename": "data.csv"},
    )
    assert response.status_code == 403
    assert "Invalid role" in response.json()["detail"]
    assert "Company scope" not in response.json()["detail"]


def user_database(monkeypatch, company_id=None, exists=True, failure=None, role=None):
    class Snapshot:
        def __init__(self):
            self.exists = exists

        def to_dict(self):
            return {"company_id": company_id, "role": role}

    class Reference:
        def get(self, **kwargs):
            assert kwargs == {"retry": None, "timeout": 3.0}
            if failure:
                raise failure
            return Snapshot()

    class Collection:
        def document(self, uid):
            assert uid == "user-1"
            return Reference()

    class Database:
        def collection(self, name):
            assert name == "users"
            return Collection()

    monkeypatch.setattr(auth.database, "db", Database())


@pytest.mark.parametrize(
    ("company_id", "exists", "expected"),
    [
        ("acme", True, 200),
        ("other-company", True, 403),
        (None, True, 403),
        (None, False, 403),
    ],
)
def test_firestore_user_document_supplies_missing_company_claim(
    monkeypatch, company_id, exists, expected
):
    user_database(monkeypatch, company_id, exists)
    monkeypatch.setattr(
        firebase_auth, "verify_id_token", lambda _: {"uid": "user-1", "role": "editor"}
    )
    response = client.get("/api/companies/acme/records", headers=HEADERS)
    assert response.status_code == expected, response.text
    if expected == 403:
        assert "Company scope mismatch" in response.json()["detail"]


def test_unavailable_tenant_lookup_fails_explicitly(monkeypatch):
    user_database(monkeypatch, failure=ServiceUnavailable("Firestore unavailable"))
    monkeypatch.setattr(
        firebase_auth, "verify_id_token", lambda _: {"uid": "user-1", "role": "admin"}
    )
    response = client.get("/api/companies/acme/records", headers=HEADERS)
    assert response.status_code == 503
    assert "Unable to verify company access" in response.json()["detail"]


def test_missing_bearer_token_remains_401():
    response = client.get(
        "/api/companies/acme/records", headers={"X-User-Role": "admin"}
    )
    assert response.status_code == 401
    assert "Missing bearer token" in response.json()["detail"]


@pytest.mark.parametrize("role", ["editor", "admin", "super-admin", "viewer"])
def test_auth_context_returns_only_current_user_metadata(monkeypatch, role):
    user_database(monkeypatch, company_id="document-company")
    monkeypatch.setattr(
        firebase_auth,
        "verify_id_token",
        lambda _: {
            "uid": "user-1",
            "role": role,
            "company_id": "real-company",
            "unrelated_claim": "not-returned",
        },
    )
    response = client.get("/api/auth/context", headers=HEADERS)
    assert response.status_code == 200
    assert response.json() == {
        "uid": "user-1",
        "role": role,
        "company_id": "real-company",
    }


def test_auth_context_uses_firestore_company_assignment(monkeypatch):
    user_database(monkeypatch, company_id="assigned-company")
    monkeypatch.setattr(
        firebase_auth,
        "verify_id_token",
        lambda _: {
            "uid": "user-1",
            "role": "editor",
        },
    )
    response = client.get("/api/auth/context", headers=HEADERS)
    assert response.status_code == 200
    assert response.json()["company_id"] == "assigned-company"


def test_auth_context_never_guesses_a_company(monkeypatch):
    user_database(monkeypatch, exists=False)
    monkeypatch.setattr(
        firebase_auth,
        "verify_id_token",
        lambda _: {
            "uid": "user-1",
            "role": "super-admin",
        },
    )
    response = client.get("/api/auth/context", headers=HEADERS)
    assert response.status_code == 404
    assert response.json()["detail"] == "Authenticated user profile not found."


def test_auth_context_requires_bearer_token():
    response = client.get("/api/auth/context", headers={"X-User-Role": "admin"})
    assert response.status_code == 401


def test_auth_context_firestore_failure_is_explicit(monkeypatch):
    user_database(monkeypatch, failure=ServiceUnavailable("Firestore unavailable"))
    monkeypatch.setattr(
        firebase_auth,
        "verify_id_token",
        lambda _: {
            "uid": "user-1",
            "role": "admin",
            "company_id": "acme",
        },
    )
    response = client.get("/api/auth/context", headers=HEADERS)
    assert response.status_code == 503
    assert "Unable to verify company access" in response.json()["detail"]


def test_auth_context_rejects_missing_uid(monkeypatch):
    monkeypatch.setattr(firebase_auth, "verify_id_token", lambda _: {"role": "admin"})
    response = client.get("/api/auth/context", headers=HEADERS)
    assert response.status_code == 401
    assert response.json()["detail"] == "Authenticated user is missing a UID."


def test_auth_context_rejects_unassigned_profile(monkeypatch):
    user_database(monkeypatch)
    monkeypatch.setattr(
        firebase_auth,
        "verify_id_token",
        lambda _: {
            "sub": "user-1",
            "role": "editor",
        },
    )
    response = client.get("/api/auth/context", headers=HEADERS)
    assert response.status_code == 403
    assert "no company is assigned" in response.json()["detail"]


@pytest.mark.parametrize("claim", [None, "", " ", "none", " None "])
@pytest.mark.parametrize("role", ["Editor", "Admin", "Super-Admin"])
def test_missing_role_uses_firestore_for_context_and_upload(monkeypatch, claim, role):
    user_database(monkeypatch, company_id="acme", role=role)
    token = {"uid": "user-1", "role": claim}
    monkeypatch.setattr(firebase_auth, "verify_id_token", lambda _: token)
    context = client.get("/api/auth/context", headers=HEADERS)
    assert context.status_code == 200, context.text
    assert context.json() == {
        "uid": "user-1",
        "role": role.lower(),
        "company_id": "acme",
    }

    class Blob:
        def generate_signed_url(self, **kwargs):
            return "https://storage.example.test/signed-upload"

    class Bucket:
        def blob(self, object_name):
            assert object_name.startswith("companies/acme/uploads/")
            return Blob()

    monkeypatch.setattr(main, "USE_EMULATOR", False)
    monkeypatch.setattr(main, "_iam_signing_kwargs", lambda: {})
    monkeypatch.setattr(main.storage, "bucket", lambda: Bucket())
    response = client.post(
        "/api/companies/acme/uploads/generate-url",
        headers=HEADERS,
        json={"filename": "data.csv"},
    )
    assert response.status_code == 200, response.text
    assert token["role"] == claim


@pytest.mark.parametrize("claim", ["viewer", "unknown"])
def test_explicit_role_is_never_upgraded_by_profile(monkeypatch, claim):
    user_database(monkeypatch, company_id="acme", role="super-admin")
    token = {"uid": "user-1", "role": claim}
    monkeypatch.setattr(firebase_auth, "verify_id_token", lambda _: token)
    response = client.post(
        "/api/companies/acme/uploads/generate-url",
        headers=HEADERS,
        json={"filename": "data.csv"},
    )
    assert response.status_code == 403
    assert "Invalid role" in response.json()["detail"]
    context = client.get("/api/auth/context", headers=HEADERS)
    assert context.status_code == 200
    assert context.json()["role"] == claim


@pytest.mark.parametrize("profile_role", [None, "", "none", "viewer", "unknown"])
def test_unprivileged_profile_does_not_authorize_editor(monkeypatch, profile_role):
    user_database(monkeypatch, company_id="acme", role=profile_role)
    with pytest.raises(HTTPException) as error:
        auth.require_role(["editor"])({"uid": "user-1"})
    assert error.value.status_code == 403
    assert "Invalid role" in error.value.detail


def test_firestore_role_failure_does_not_authorize(monkeypatch):
    user_database(monkeypatch, failure=ServiceUnavailable("unavailable"))
    with pytest.raises(HTTPException) as error:
        auth.require_role(["editor"])({"uid": "user-1"})
    assert error.value.status_code == 503


def test_firestore_super_admin_retains_cross_company_access(monkeypatch):
    user_database(monkeypatch, company_id="other-company", role="Super-Admin")
    token = {"uid": "user-1"}
    result = auth.verify_company_access("acme", token)
    assert result == {"uid": "user-1", "role": "super-admin"}


def test_firestore_admin_is_still_tenant_scoped(monkeypatch):
    user_database(monkeypatch, company_id="other-company", role="Admin")
    monkeypatch.setattr(firebase_auth, "verify_id_token", lambda _: {"uid": "user-1"})
    response = client.get("/api/companies/acme/records", headers=HEADERS)
    assert response.status_code == 403
    assert "Company scope mismatch" in response.json()["detail"]


@pytest.mark.parametrize("company_id", ["", 123, ["acme"], {"id": "acme"}])
def test_malformed_company_claim_is_not_authorized(monkeypatch, company_id):
    monkeypatch.setattr(
        firebase_auth,
        "verify_id_token",
        lambda _: {
            "uid": "user-1",
            "role": "admin",
            "company_id": company_id,
        },
    )
    response = client.get("/api/companies/acme/records", headers=HEADERS)
    assert response.status_code == 403
    assert "Company scope mismatch" in response.json()["detail"]


def test_admin_requirement_does_not_authorize_editor():
    with pytest.raises(HTTPException) as error:
        auth.require_role(["admin"])({"role": "editor"})
    assert error.value.status_code == 403


def test_invitations_provision_tenant_claim_and_preserve_other_claims(monkeypatch):
    from types import SimpleNamespace

    monkeypatch.setattr(
        firebase_auth,
        "verify_id_token",
        lambda _: {
            "uid": "user-1",
            "role": "admin",
            "company_id": "acme",
        },
    )
    monkeypatch.setattr(
        firebase_auth,
        "create_user",
        lambda **kwargs: SimpleNamespace(
            uid="new-user",
            custom_claims={"existing_feature": True},
        ),
    )
    monkeypatch.setattr(
        firebase_auth,
        "generate_email_verification_link",
        lambda _: "https://example.test/verify",
    )
    assigned = []
    monkeypatch.setattr(
        firebase_auth,
        "set_custom_user_claims",
        lambda uid, claims: assigned.append((uid, claims)),
    )

    class Reference:
        def collection(self, name):
            assert name in {"companies", "invitations"}
            return self

        def document(self, document_id):
            return self

        def set(self, data):
            assert data["auth_uid"] == "new-user"

    monkeypatch.setattr(main, "db", Reference())
    response = client.post(
        "/api/companies/acme/users/invite",
        headers=HEADERS,
        json={"email": "new@example.com", "role": "editor"},
    )
    assert response.status_code == 201, response.text
    assert assigned == [
        ("new-user", {"existing_feature": True, "role": "editor", "company_id": "acme"})
    ]
