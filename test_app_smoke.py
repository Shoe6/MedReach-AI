from fastapi.testclient import TestClient

from main import app


client = TestClient(app)


def test_health_endpoint_returns_healthy() -> None:
    response = client.get("/api/health")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "healthy"
    assert body["database"] == "emulator_connected"
