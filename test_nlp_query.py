"""Tests for the Natural Language Query endpoint and service (LLM calls are mocked)."""

import os
from uuid import uuid4

import httpx
import pandas as pd
import pytest
from fastapi.testclient import TestClient

import nlp_query_service as svc
from auth import verify_firebase_token
from main import app

SAMPLE_ROWS = [
    {
        "NPI": 1000000001,
        "Provider_Name": "Dr. Ana Ruiz",
        "Specialty": "Cardiology",
        "State": "TX",
        "City": "Austin",
        "PII_Violations_Count": 0,
        "Is_Duplicate": False,
    },
    {
        "NPI": 1000000002,
        "Provider_Name": "Dr. Ben Cole",
        "Specialty": "Interventional Cardiology",
        "State": "TX",
        "City": "Dallas",
        "PII_Violations_Count": 3,
        "Is_Duplicate": True,
    },
    {
        "NPI": 1000000003,
        "Provider_Name": "Dr. Cara Lin",
        "Specialty": "Family Medicine",
        "State": "CA",
        "City": None,
        "PII_Violations_Count": 5,
        "Is_Duplicate": True,
    },
]


@pytest.fixture
def dataset_dir(tmp_path, monkeypatch):
    pd.DataFrame(SAMPLE_ROWS).to_csv(tmp_path / "providers.csv", index=False)
    monkeypatch.setenv("NLP_DATASET_DIR", str(tmp_path))
    return tmp_path


@pytest.fixture
def client():
    app.dependency_overrides[verify_firebase_token] = lambda: {
        "uid": "test-user",
        "role": "viewer",
    }
    yield TestClient(app)
    app.dependency_overrides.pop(verify_firebase_token, None)


@pytest.fixture
def fake_llm(monkeypatch):
    """Replace the gemini provider; set ``fake_llm.response`` to control its output."""

    class FakeLLM:
        response = ""
        calls = []

        def __call__(self, system_prompt, user_query, model):
            self.calls.append((system_prompt, user_query))
            return self.response

    fake = FakeLLM()
    monkeypatch.setitem(svc.LLM_PROVIDERS, "gemini", fake)
    monkeypatch.setenv("NLP_LLM_PROVIDER", "gemini")
    return fake


def _search(
    client, query="cardiologists in Texas", dataset_id="providers.csv", **extra
):
    return client.post(
        "/api/dataset/nlp-search",
        json={"query": query, "dataset_id": dataset_id, **extra},
    )


def test_success_returns_filtered_results(client, dataset_dir, fake_llm):
    fake_llm.response = (
        "Specialty.str.contains('cardio', case=False, na=False) and State == 'TX'"
    )
    resp = _search(client)
    assert resp.status_code == 200
    body = resp.json()
    assert body["success"] is True
    assert body["applied_query"] == fake_llm.response
    assert body["total_matches"] == 2
    assert {r["NPI"] for r in body["results"]} == {1000000001, 1000000002}
    system_prompt, user_query = fake_llm.calls[0]
    assert "PII_Violations_Count" in system_prompt and "single quotes" in system_prompt
    assert user_query == "cardiologists in Texas"


def test_nan_values_serialize_as_null_and_limit_applies(client, dataset_dir, fake_llm):
    fake_llm.response = "Is_Duplicate == True"
    body = _search(client, dataset_id="providers", limit=1).json()
    assert body["total_matches"] == 2
    assert body["returned_count"] == 1
    body = _search(client, dataset_id="providers").json()
    assert any(r["City"] is None for r in body["results"])


def test_markdown_fenced_output_is_cleaned(client, dataset_dir, fake_llm):
    fake_llm.response = "```python\nPII_Violations_Count > 2\n```"
    body = _search(client).json()
    assert body["applied_query"] == "PII_Violations_Count > 2"
    assert body["total_matches"] == 2


def test_missing_dataset_returns_404(client, dataset_dir, fake_llm):
    resp = _search(client, dataset_id="does_not_exist.csv")
    assert resp.status_code == 404
    assert resp.json()["success"] is False
    assert "not found" in resp.json()["error"]
    assert fake_llm.calls == []


@pytest.mark.parametrize(
    "dataset_id", ["../secrets.csv", "..\\x.csv", "sub/providers.csv", "C:\\x.csv", ""]
)
def test_path_traversal_dataset_id_returns_400(
    client, dataset_dir, fake_llm, dataset_id
):
    resp = _search(client, dataset_id=dataset_id)
    assert resp.status_code == 400
    assert "error" in resp.json()


def test_empty_query_returns_400(client, dataset_dir, fake_llm):
    assert _search(client, query="   ").status_code == 400


def test_hallucinated_column_returns_422(client, dataset_dir, fake_llm):
    fake_llm.response = "Provider_Rating > 4"
    resp = _search(client)
    assert resp.status_code == 422
    assert "doesn't exist" in resp.json()["error"]


def test_invalid_syntax_returns_422(client, dataset_dir, fake_llm):
    fake_llm.response = "State == 'TX' and and"
    resp = _search(client)
    assert resp.status_code == 422
    assert "syntax" in resp.json()["error"]


def test_invalid_query_sentinel_returns_422(client, dataset_dir, fake_llm):
    fake_llm.response = "INVALID_QUERY"
    assert _search(client).status_code == 422


@pytest.mark.parametrize(
    "malicious",
    [
        "NPI.__class__.__init__.__globals__",
        "__import__('os').system('echo pwned')",
        "@svc",
        "State.apply(print)",
        "NPI.isin(open('x'))",
        "[c for c in State]",
        "lambda: 1",
    ],
)
def test_unsafe_generated_queries_are_rejected(
    client, dataset_dir, fake_llm, malicious
):
    fake_llm.response = malicious
    resp = _search(client)
    assert resp.status_code == 422
    assert resp.json()["success"] is False


def test_llm_failure_returns_502(client, dataset_dir, monkeypatch):
    def boom(*_args):
        raise RuntimeError("quota exceeded")

    monkeypatch.setitem(svc.LLM_PROVIDERS, "gemini", boom)
    monkeypatch.setenv("NLP_LLM_PROVIDER", "gemini")
    assert _search(client).status_code == 502


def test_missing_api_key_returns_503(client, dataset_dir, monkeypatch):
    monkeypatch.setenv("NLP_LLM_PROVIDER", "gemini")
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    monkeypatch.delenv("GOOGLE_API_KEY", raising=False)
    resp = _search(client)
    assert resp.status_code == 503
    assert "GEMINI_API_KEY" in resp.json()["error"]


def test_requires_authentication(dataset_dir):
    resp = TestClient(app).post(
        "/api/dataset/nlp-search", json={"query": "x", "dataset_id": "providers.csv"}
    )
    assert resp.status_code == 401


def test_bearer_token_is_passed_to_firebase_verifier(dataset_dir, fake_llm, monkeypatch):
    from auth import firebase_auth

    fake_llm.response = "State == 'TX'"
    received_tokens = []

    def verify(token):
        received_tokens.append(token)
        return {"uid": "firebase-user"}

    monkeypatch.setattr(firebase_auth, "verify_id_token", verify)
    response = TestClient(app).post(
        "/api/dataset/nlp-search",
        json={"query": "Texas", "dataset_id": "providers.csv"},
        headers={"Authorization": "Bearer test-id-token"},
    )
    assert response.status_code == 200
    assert response.json()["total_matches"] == 2
    assert received_tokens == ["test-id-token"]


def test_invalid_bearer_token_returns_401(dataset_dir, monkeypatch):
    from auth import firebase_auth

    def verify(token):
        raise firebase_auth.InvalidIdTokenError("Invalid test token")

    monkeypatch.setattr(firebase_auth, "verify_id_token", verify)
    response = TestClient(app).post(
        "/api/dataset/nlp-search",
        json={"query": "Texas", "dataset_id": "providers.csv"},
        headers={"Authorization": "Bearer invalid-token"},
    )
    assert response.status_code == 401
    assert response.headers["www-authenticate"] == "Bearer"


@pytest.mark.parametrize("host", ["localhost", "127.0.0.1"])
def test_nlp_cors_preflight_accepts_authorization(host):
    origin = f"http://{host}:5173"
    response = TestClient(app).options(
        "/api/dataset/nlp-search",
        headers={
            "Origin": origin,
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "authorization,content-type",
        },
    )
    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == origin
    assert "authorization" in response.headers["access-control-allow-headers"].lower()


@pytest.mark.skipif(
    os.getenv("MEDREACH_TEST_AUTH_EMULATOR") != "1",
    reason="Set MEDREACH_TEST_AUTH_EMULATOR=1 with the local Auth emulator running.",
)
def test_real_emulator_token_authenticates_nlp_request(dataset_dir, fake_llm):
    host = os.environ["FIREBASE_AUTH_EMULATOR_HOST"]
    assert host in {"127.0.0.1:9099", "localhost:9099"}
    base_url = f"http://{host}/identitytoolkit.googleapis.com/v1"
    with httpx.Client(timeout=10) as emulator:
        signup = emulator.post(
            f"{base_url}/accounts:signUp",
            params={"key": "local-emulator-key"},
            json={
                "email": f"nlp-test-{uuid4().hex}@example.test",
                "password": uuid4().hex,
                "returnSecureToken": True,
            },
        )
        signup.raise_for_status()
        token = signup.json()["idToken"]
        try:
            fake_llm.response = "State == 'TX'"
            response = TestClient(app).post(
                "/api/dataset/nlp-search",
                json={"query": "Texas", "dataset_id": "providers.csv"},
                headers={"Authorization": f"Bearer {token}"},
            )
            assert response.status_code == 200, response.text
            assert response.json()["total_matches"] == 2
        finally:
            deleted = emulator.post(
                f"{base_url}/accounts:delete",
                params={"key": "local-emulator-key"},
                json={"idToken": token},
            )
            deleted.raise_for_status()
