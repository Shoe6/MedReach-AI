from fastapi.testclient import TestClient

from main import app

client = TestClient(app)


def test_detect_duplicate_clusters_groups_same_npi_and_email():
    from ingestion import detect_duplicate_clusters

    rows = [
        {"row_index": 0, "first_name": "John", "last_name": "Doe", "npi": "1234567890", "email": "john@example.com", "phone": "555-123-4567"},
        {"row_index": 1, "first_name": "John", "last_name": "Doe", "npi": "1234567890", "email": "john.doe@example.com", "phone": "555-123-4567"},
        {"row_index": 2, "first_name": "Mary", "last_name": "Jones", "npi": "0987654321", "email": "mary@example.com", "phone": "555-999-1111"},
    ]

    clusters = detect_duplicate_clusters(rows)
    assert len(clusters) >= 1
    assert any(cluster["match_type"] in {"npi", "email", "name_phone"} for cluster in clusters)
    assert any(len(cluster["records"]) >= 2 for cluster in clusters)


def test_upload_returns_duplicate_clusters():
    csv_data = "npi,first_name,last_name,email,phone\n1234567890,John,Doe,john@example.com,555-123-4567\n1234567890,John,Doe,john.doe@example.com,555-123-4567\n"

    response = client.post(
        "/api/companies/test-dedupe-company/upload_file",
        files={"file": ("dupes.csv", csv_data, "text/csv")},
        headers={"X-User-Role": "admin"},
    )

    assert response.status_code == 201
    payload = response.json()
    assert "duplicate_clusters" in payload
    assert isinstance(payload["duplicate_clusters"], list)
