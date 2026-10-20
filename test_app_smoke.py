from fastapi.testclient import TestClient

import main
from main import app


client = TestClient(app)


def test_health_endpoint_returns_healthy() -> None:
    response = client.get("/api/health")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "healthy"
    assert body["database"] == "emulator_connected"


def test_hosting_origins_allow_upload_preflight() -> None:
    for origin in ("https://medreachai-679aa.web.app", "https://medreachai-679aa.firebaseapp.com"):
        response = client.options(
            "/api/upload/generate-url",
            headers={
                "Origin": origin,
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "content-type,x-user-role",
            },
        )
        assert response.status_code == 200
        assert response.headers["access-control-allow-origin"] == origin


def test_untrusted_origin_is_rejected() -> None:
    response = client.options(
        "/api/upload/generate-url",
        headers={
            "Origin": "https://untrusted.example.com",
            "Access-Control-Request-Method": "POST",
        },
    )
    assert response.status_code == 400
    assert "access-control-allow-origin" not in response.headers


def test_health_reports_live_firestore_mode(monkeypatch) -> None:
    monkeypatch.setattr(main, "USE_EMULATOR", False)
    monkeypatch.setattr(main.db, "collections", lambda: iter(()))
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json()["database"] == "firestore_connected"
