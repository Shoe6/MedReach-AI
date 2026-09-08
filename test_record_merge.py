from fastapi.testclient import TestClient

from database import db
from main import app

client = TestClient(app)


def test_merge_record_cluster_service_keeps_non_null_values():
    from record_merge_service import merge_record_cluster

    records = [
        {
            "record_id": "r1",
            "npi": "1234567890",
            "first_name": "John",
            "last_name": "Doe",
            "email": "",
            "phone": "555-111-2222",
            "specialty": "Cardiology",
        },
        {
            "record_id": "r2",
            "npi": "1234567890",
            "first_name": "",
            "last_name": "Doe",
            "email": "john.doe@example.com",
            "phone": "555-111-2222",
            "specialty": "",
        },
    ]

    merged = merge_record_cluster(records)

    assert merged["master_record"]["npi"] == "1234567890"
    assert merged["master_record"]["last_name"] == "Doe"
    assert merged["master_record"]["email"] == "john.doe@example.com"
    assert merged["master_record"]["phone"] == "555-111-2222"
    assert len(merged["archived_records"]) == 1


def test_merge_records_endpoint_returns_master_and_archived_records():
    payload = {
        "records": [
            {
                "record_id": "r1",
                "npi": "1234567890",
                "first_name": "John",
                "last_name": "Doe",
                "email": "",
                "phone": "555-111-2222",
                "Has_Opted_In": True,
            },
            {
                "record_id": "r2",
                "npi": "1234567890",
                "first_name": "",
                "last_name": "Doe",
                "email": "john.doe@example.com",
                "phone": "555-111-2222",
            },
        ],
        "master_record_id": "r1",
    }

    response = client.post(
        "/api/companies/test-merge-company/records/merge",
        json=payload,
        headers={"X-User-Role": "admin"},
    )

    assert response.status_code == 200, response.text
    data = response.json()
    assert data["company_id"] == "test-merge-company"
    assert data["merged_record"]["record_id"] == "r1"
    assert len(data["archived_records"]) == 1

    persisted = (
        db.collection("companies")
        .document("test-merge-company")
        .collection("records")
        .document("r1")
        .get()
    )
    assert persisted.exists
    assert persisted.to_dict()["email"] == "john.doe@example.com"

    export_response = client.get("/api/companies/test-merge-company/export_data")
    assert export_response.status_code == 200
    exported_records = export_response.json()["records"]
    assert {record["record_id"] for record in exported_records} == {"r1", "r2"}


def test_merge_records_endpoint_persists_every_incoming_record():
    company_id = "test-merge-all-records-company"
    payload = {
        "records": [
            {"record_id": "uploaded-1", "name": "First Provider"},
            {"record_id": "uploaded-2", "name": "Second Provider"},
        ],
    }

    response = client.post(f"/api/companies/{company_id}/records/merge", json=payload, headers={"X-User-Role": "admin"})

    assert response.status_code == 200, response.text
    records = list(
        db.collection("companies").document(company_id).collection("records").stream()
    )
    assert {record.to_dict()["name"] for record in records} == {
        "First Provider",
        "Second Provider",
    }


def test_merge_records_endpoint_requires_records_field():
    response = client.post("/api/companies/test-merge-company/records/merge", json={}, headers={"X-User-Role": "admin"})

    assert response.status_code == 422


def test_merge_records_endpoint_logs_and_returns_execution_error(monkeypatch, caplog):
    def raise_database_error(*args, **kwargs):
        raise RuntimeError("database unavailable")

    monkeypatch.setattr("main.merge_record_cluster", raise_database_error)

    response = client.post(
        "/api/companies/test-merge-company/records/merge",
        json={"records": [{"record_id": "r1"}]},
        headers={"X-User-Role": "admin"},
    )

    assert response.status_code == 500
    assert response.json()["detail"] == "database unavailable"
    assert "Failed to merge company records" in caplog.text
