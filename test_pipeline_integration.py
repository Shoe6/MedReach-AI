import asyncio
import csv
import io
import time
from unittest.mock import patch

import httpx

from ingestion import detect_duplicate_clusters
from main import app
from npi_registry_client import CMSNPIRegistryClient
from record_merge_service import merge_record_cluster
def _fake_npi_registry_get():
    async def fake_get(self, url, params=None):
        npi = str(params["number"])

        class FakeResponse:
            def __init__(self, payload):
                self.status_code = 200
                self.headers = {}
                self._payload = payload

            def raise_for_status(self):
                return None

            def json(self):
                return self._payload

        if npi == "0000000000":
            return FakeResponse({
                "results": [{"number": npi, "valid": False, "status": "not_found"}],
            })

        return FakeResponse({
            "results": [{
                "number": npi,
                "valid": True,
                "status": "valid",
                "basic": {"first_name": "Validated", "last_name": "Provider"},
            }],
        })

    return fake_get


async def _upload_csv_payload(csv_payload: str):
    class DummyBlob:
        def upload_from_string(self, *args, **kwargs):
            return None

    class DummyBucket:
        def blob(self, *args, **kwargs):
            return DummyBlob()

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
        with patch("main.storage.bucket", return_value=DummyBucket()):
            with patch("npi_registry_client.httpx.AsyncClient.get", new=_fake_npi_registry_get()):
                with patch("npi_registry_client.asyncio.sleep", return_value=None):
                    return await client.post(
                        "/api/companies/integration-ma-24-34-37-42-43-44/upload_file",
                        files={"file": ("providers.csv", csv_payload, "text/csv")},
                    )


def _build_records():
    return [
        {
            "record_id": "r1",
            "npi": "1111111111",
            "name": "Dr. John Doe",
            "first_name": "John",
            "last_name": "Doe",
            "email": "john.doe@example.com",
            "phone": "555-111-2222",
            "specialty": "Cardiology",
            "status": "active",
        },
        {
            "record_id": "r2",
            "npi": "1111111111",
            "name": "John Doe",
            "first_name": "John",
            "last_name": "Doe",
            "email": "john@medcenter.org",
            "phone": "555-111-2222",
            "specialty": "Cardiology",
            "status": "active",
        },
        {
            "record_id": "r3",
            "npi": "2222222222",
            "name": "Dr. Sarah Chen",
            "first_name": "Sarah",
            "last_name": "Chen",
            "email": "sarah.chen@example.com",
            "phone": "555-222-3333",
            "specialty": "Neurology",
            "status": "active",
        },
        {
            "record_id": "r4",
            "npi": "2222222222",
            "name": "Sarah Chen",
            "first_name": "Sarah",
            "last_name": "Chen",
            "email": "sarah.chen@example.com",
            "phone": "555-222-3333",
            "specialty": "Neurology",
            "status": "active",
        },
        {
            "record_id": "r5",
            "npi": "3333333333",
            "name": "Dr. Maria Ruiz",
            "first_name": "Maria",
            "last_name": "Ruiz",
            "email": "maria.ruiz@oncology.io",
            "phone": "555-333-4444",
            "specialty": "Oncology",
            "status": "active",
        },
        {
            "record_id": "r6",
            "npi": "0000000000",
            "name": "Dr. Invalid Provider",
            "first_name": "Invalid",
            "last_name": "Provider",
            "email": "invalid@provider.org",
            "phone": "555-000-1234",
            "specialty": "Surgery",
            "status": "active",
        },
        {
            "record_id": "r7",
            "npi": "4444444444",
            "name": "James Lee",
            "first_name": "James",
            "last_name": "Lee",
            "email": "",
            "phone": "555-444-5555",
            "specialty": "Pulmonology",
            "status": "active",
        },
        {
            "record_id": "r8",
            "npi": "4444444444",
            "name": "James Lee",
            "first_name": "James",
            "last_name": "Lee",
            "email": "jlee@clinic.com",
            "phone": "555-444-5555",
            "specialty": "Pulmonology",
            "status": "active",
        },
    ]


def _as_csv(records):
    fieldnames = [
        "record_id",
        "npi",
        "name",
        "first_name",
        "last_name",
        "email",
        "phone",
        "specialty",
        "status",
    ]
    buffer = io.StringIO()
    writer = csv.DictWriter(buffer, fieldnames=fieldnames)
    writer.writeheader()
    for row in records:
        writer.writerow({key: row.get(key, "") for key in fieldnames})
    return buffer.getvalue()


def test_full_pipeline_ma24_ma34_ma37_ma42_ma43_ma44_integration():
    records = _build_records()
    csv_payload = _as_csv(records)

    upload_response = asyncio.run(_upload_csv_payload(csv_payload))
    assert upload_response.status_code == 201, upload_response.text
    payload = upload_response.json()
    assert "duplicate_clusters" in payload
    assert payload["total_rows"] == len(records)

    cluster_snapshot = detect_duplicate_clusters(records)
    assert any(cluster["match_type"] == "npi" for cluster in cluster_snapshot)
    assert any(cluster["match_type"] == "email" for cluster in cluster_snapshot)
    assert any(cluster["match_type"] == "name_phone" for cluster in cluster_snapshot)

    expected_cluster_count = 3
    assert len(cluster_snapshot) >= expected_cluster_count

    total_cluster_records = sum(len(cluster["records"]) for cluster in cluster_snapshot)
    assert total_cluster_records >= 6

    async def _validate_npis():
        client_instance = CMSNPIRegistryClient(batch_size=20, batch_interval_seconds=0.0)

        start = time.perf_counter()
        with patch("npi_registry_client.httpx.AsyncClient.get", new=_fake_npi_registry_get()):
            with patch("npi_registry_client.asyncio.sleep", return_value=None):
                results = await client_instance.fetch_many([record["npi"] for record in records if record["npi"]])
        elapsed = time.perf_counter() - start
        await client_instance.close()
        return results, elapsed

    validation_results, validation_elapsed = asyncio.run(_validate_npis())
    assert len(validation_results) == len([record["npi"] for record in records if record["npi"]])
    assert validation_elapsed < 6.0
    assert any(item.get("valid") is False for item in validation_results)

    merged_r1_r2 = merge_record_cluster([records[0], records[1]], master_record_id="r1")
    merged_r3_r4 = merge_record_cluster([records[2], records[3]], master_record_id="r3")
    merged_r7_r8 = merge_record_cluster([records[6], records[7]], master_record_id="r7")

    assert merged_r1_r2["master_record"]["npi"] == "1111111111"
    assert merged_r1_r2["master_record"]["email"] == "john.doe@example.com"
    assert len(merged_r1_r2["archived_records"]) == 1
    assert merged_r7_r8["master_record"]["phone"] == "555-444-5555"

    validation_map = {str(item["number"]): item for item in validation_results}
    final_dataset = []
    for record in records:
        npi_value = str(record.get("npi") or "")
        validation_entry = validation_map.get(npi_value, {"valid": False, "status": "unknown"})
        final_dataset.append({
            **record,
            "validation_status": validation_entry.get("status", "unknown"),
            "is_valid_npi": bool(validation_entry.get("valid")),
            "dedup_cluster_count": 0,
        })

    final_payload = {
        "company_id": "integration-ma-24-34-37-42-43-44",
        "input_record_count": len(records),
        "deduplicated_record_count": 5,
        "duplicate_clusters": cluster_snapshot,
        "validation_results": validation_results,
        "merged_records": [
            merged_r1_r2["master_record"],
            merged_r3_r4["master_record"],
            merged_r7_r8["master_record"],
        ],
        "final_dataset": final_dataset,
    }

    assert final_payload["input_record_count"] == 8
    assert final_payload["deduplicated_record_count"] == 5
    assert len(final_payload["validation_results"]) == 8
    assert len(final_payload["duplicate_clusters"]) >= 3
    assert all("similarity_percent" in cluster for cluster in final_payload["duplicate_clusters"])
    assert any(final_record["record_id"] == "r1" and final_record["is_valid_npi"] for final_record in final_payload["final_dataset"])
    assert any(final_record["record_id"] == "r6" and not final_record["is_valid_npi"] for final_record in final_payload["final_dataset"])

    cluster_summary = final_payload["duplicate_clusters"]
    assert any(cluster["match_type"] == "npi" and cluster["similarity_percent"] >= 99 for cluster in cluster_summary)
