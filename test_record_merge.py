from fastapi.testclient import TestClient

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
    )

    assert response.status_code == 200, response.text
    data = response.json()
    assert data["company_id"] == "test-merge-company"
    assert data["merged_record"]["record_id"] == "r1"
    assert len(data["archived_records"]) == 1
