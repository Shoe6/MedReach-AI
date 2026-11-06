import time

import pytest
from fastapi.testclient import TestClient

import main as main_module
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


def test_merge_records_endpoint_flags_true_duplicate_clusters_only():
    """Regression test: the real upload flow (records/merge) previously never set
    is_duplicate at all, so the Duplicates category/tab always read zero for
    genuinely uploaded data. Same NPI twice should be flagged; a distinct NPI
    should not."""
    company_id = "test-merge-duplicate-flagging-company"
    payload = {
        "records": [
            {"record_id": "dup-1", "npi": "1111111111", "name": "Provider A"},
            {"record_id": "dup-2", "npi": "1111111111", "name": "Provider A Clone"},
            {"record_id": "unique-1", "npi": "2222222222", "name": "Provider B"},
        ],
    }

    response = client.post(f"/api/companies/{company_id}/records/merge", json=payload, headers={"X-User-Role": "admin"})

    assert response.status_code == 200, response.text
    records = {
        record.to_dict()["record_id"]: record.to_dict()
        for record in db.collection("companies").document(company_id).collection("records").stream()
    }
    assert records["dup-1"]["is_duplicate"] is True
    assert records["dup-2"]["is_duplicate"] is True
    assert records["unique-1"]["is_duplicate"] is False


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


class _UnreachableNode:
    """Mimics the Firestore client's chained collection()/document() calls,
    raising only when a write is actually attempted."""

    def collection(self, *args, **kwargs):
        return self

    def document(self, *args, **kwargs):
        return self

    def batch(self):
        return self

    def set(self, *args, **kwargs):
        return None

    def commit(self, *args, **kwargs):
        raise ConnectionError("[Errno 10061] Connection refused")


def test_merge_records_endpoint_fails_fast_when_firestore_unreachable(monkeypatch):
    monkeypatch.setattr(main_module, "db", _UnreachableNode())
    monkeypatch.setattr(main_module, "ALLOW_OFFLINE_FIRESTORE_WRITES", False)

    payload = {
        "records": [
            {"record_id": "r1", "name": "Provider One"},
            {"record_id": "r2", "name": "Provider Two"},
        ],
        "master_record_id": "r1",
    }

    started = time.monotonic()
    response = client.post(
        "/api/companies/unreachable-company/records/merge",
        json=payload,
        headers={"X-User-Role": "admin"},
    )
    elapsed = time.monotonic() - started

    assert response.status_code == 503
    assert "Firestore is unreachable" in response.json()["detail"]
    assert elapsed < 5, f"Expected a fast failure, took {elapsed:.1f}s"


def test_merge_records_endpoint_skips_write_when_offline_bypass_enabled(monkeypatch):
    monkeypatch.setattr(main_module, "db", _UnreachableNode())
    monkeypatch.setattr(main_module, "USE_EMULATOR", True)
    monkeypatch.setattr(main_module, "ALLOW_OFFLINE_FIRESTORE_WRITES", True)

    payload = {
        "records": [
            {"record_id": "r1", "name": "Provider One"},
            {"record_id": "r2", "name": "Provider Two"},
        ],
        "master_record_id": "r1",
    }

    response = client.post(
        "/api/companies/offline-bypass-company/records/merge",
        json=payload,
        headers={"X-User-Role": "admin"},
    )

    assert response.status_code == 200, response.text
    assert response.json()["merged_record"]["record_id"] == "r1"


@pytest.fixture
def chunked_merge(monkeypatch):
    from unittest.mock import Mock

    commits = []
    scrub_sizes = []
    collections = Mock()
    collections.collection.return_value.document.return_value.collection.return_value.document.side_effect = (
        lambda record_id: record_id
    )

    def make_batch():
        writes = []
        batch = Mock()
        batch.set.side_effect = lambda reference, record: writes.append((reference, dict(record)))

        def commit(**kwargs):
            assert kwargs == {"retry": None, "timeout": main_module.FIRESTORE_WRITE_TIMEOUT_SECONDS}
            commits.append(writes)

        batch.commit.side_effect = commit
        return batch

    collections.batch.side_effect = make_batch

    async def scrub(records, *, npi_cache):
        scrub_sizes.append(len(records))
        return [dict(record, pii_flagged=True) for record in records]

    collect = Mock()
    monkeypatch.setattr(main_module, "db", collections)
    monkeypatch.setattr(main_module, "scrub_provider_records", scrub)
    monkeypatch.setattr(main_module.gc, "collect", collect)
    monkeypatch.setattr(main_module, "ALLOW_OFFLINE_FIRESTORE_WRITES", False)
    return commits, scrub_sizes, collect, collections


@pytest.mark.parametrize("count", [1, 250, 251, 501])
def test_merge_records_chunks_scrubbing_and_batch_commits(chunked_merge, count):
    commits, scrub_sizes, collect, _ = chunked_merge
    records = [
        {"record_id": f"r{index}", "email": f"provider{index}@example.test"}
        for index in range(count)
    ]
    records[0]["email"] = "duplicate@example.test"
    records[-1]["email"] = "duplicate@example.test"
    records[0]["specialty"] = "Cardiology"
    response = client.post(
        "/api/companies/chunked-company/records/merge",
        json={"records": records, "master_record_id": f"r{count - 1}"},
        headers={"X-User-Role": "admin"},
    )

    assert response.status_code == 200, response.text
    expected_sizes = [min(250, count - start) for start in range(0, count, 250)]
    assert scrub_sizes == expected_sizes
    assert [len(writes) for writes in commits] == expected_sizes
    persisted = {reference: record for writes in commits for reference, record in writes}
    assert set(persisted) == {f"r{index}" for index in range(count)}
    data = response.json()
    assert data["master_record_id"] == f"r{count - 1}"
    assert data["merged_record"]["specialty"] == "Cardiology"
    assert [record["record_id"] for record in data["archived_records"]] == [
        f"r{index}" for index in range(count - 1)
    ]
    assert all(record["pii_flagged"] for record in persisted.values())
    assert all(record["merged_at"] == data["merged_record"]["merged_at"] for record in persisted.values())
    if count > 1:
        assert persisted["r0"]["is_duplicate"]
        assert persisted[f"r{count - 1}"]["is_duplicate"]
    if count > 2:
        assert not persisted["r1"]["is_duplicate"]
    assert collect.call_count == len(expected_sizes) * 2 + 1


def test_merge_records_stops_after_failed_batch(chunked_merge):
    commits, _, _, collections = chunked_merge
    make_batch = collections.batch.side_effect

    def fail_second_batch():
        batch = make_batch()
        if collections.batch.call_count >= 2:
            batch.commit.side_effect = ConnectionError("batch unavailable")
        return batch

    collections.batch.side_effect = fail_second_batch
    response = client.post(
        "/api/companies/chunked-company/records/merge",
        json={"records": [{"record_id": f"r{index}"} for index in range(501)]},
        headers={"X-User-Role": "admin"},
    )

    assert response.status_code == 503
    assert "Firestore is unreachable" in response.json()["detail"]
    assert len(commits) == 1
    assert collections.batch.call_count == 4


@pytest.mark.parametrize("error_type", [
    ConnectionError,
    TimeoutError,
    main_module.ServiceUnavailable,
    main_module.DeadlineExceeded,
    main_module.Aborted,
])
def test_merge_retries_transient_commit_failures(chunked_merge, monkeypatch, error_type, caplog):
    commits, _, _, collections = chunked_merge
    make_batch = collections.batch.side_effect
    retry_delays = []
    monkeypatch.setattr(main_module.time, "sleep", retry_delays.append)
    batches = []

    def fail_until_third_attempt():
        batch = make_batch()
        batches.append(batch)
        if len(batches) < 3:
            batch.commit.side_effect = error_type("connection dropped")
        return batch

    collections.batch.side_effect = fail_until_third_attempt
    response = client.post(
        "/api/companies/retry-company/records/merge",
        json={"records": [{"record_id": "stable-record"}]},
        headers={"X-User-Role": "admin"},
    )
    assert response.status_code == 200, response.text
    assert len(commits) == 1
    assert len(batches) == 3
    assert retry_delays == [0.5, 1.0]
    assert all(batch.commit.call_count == 1 for batch in batches)
    assert all(batch.set.call_args_list == batches[0].set.call_args_list for batch in batches)
    assert "Transient merge batch commit failure" in caplog.text


def test_merge_does_not_retry_permanent_commit_errors(chunked_merge, monkeypatch):
    commits, _, _, collections = chunked_merge
    make_batch = collections.batch.side_effect
    retry_delays = []
    monkeypatch.setattr(main_module.time, "sleep", retry_delays.append)

    def denied_batch():
        from google.api_core.exceptions import PermissionDenied

        batch = make_batch()
        batch.commit.side_effect = PermissionDenied("not allowed")
        return batch

    collections.batch.side_effect = denied_batch
    response = client.post(
        "/api/companies/retry-company/records/merge",
        json={"records": [{"record_id": "r1"}]},
        headers={"X-User-Role": "admin"},
    )
    assert response.status_code == 503
    assert collections.batch.call_count == 1
    assert commits == []
    assert retry_delays == []


def test_merge_pauses_after_each_scrubbing_and_write_chunk(chunked_merge, monkeypatch):
    delays = []
    original_sleep = main_module.asyncio.sleep

    async def record_sleep(delay):
        delays.append(delay)
        await original_sleep(0)

    monkeypatch.setattr(main_module.asyncio, "sleep", record_sleep)
    response = client.post(
        "/api/companies/pause-company/records/merge",
        json={"records": [{"record_id": f"r{i}"} for i in range(251)]},
        headers={"X-User-Role": "admin"},
    )
    assert response.status_code == 200, response.text
    assert delays == [0.5, 0.5, 0.5, 0.5]


def test_merge_retry_budget_exceeds_single_rpc_deadline(chunked_merge, monkeypatch):
    commits, _, _, collections = chunked_merge
    make_batch = collections.batch.side_effect
    monkeypatch.setattr(main_module, "FIRESTORE_WRITE_TIMEOUT_SECONDS", 0.02)
    monkeypatch.setattr(main_module, "MERGE_CHUNK_PAUSE_SECONDS", 0.001)

    def slow_batch():
        batch = make_batch()
        if collections.batch.call_count < 3:
            def timeout(**kwargs):
                time.sleep(kwargs["timeout"])
                raise main_module.DeadlineExceeded("RPC deadline")

            batch.commit.side_effect = timeout
        return batch

    collections.batch.side_effect = slow_batch
    response = client.post(
        "/api/companies/retry-company/records/merge",
        json={"records": [{"record_id": "r1"}]},
        headers={"X-User-Role": "admin"},
    )
    assert response.status_code == 200, response.text
    assert collections.batch.call_count == 3
    assert len(commits) == 1


def test_merge_records_rejects_non_object_rows_before_processing(chunked_merge):
    commits, scrub_sizes, _, _ = chunked_merge
    response = client.post(
        "/api/companies/chunked-company/records/merge",
        json={"records": [{"record_id": "valid"}, None]},
        headers={"X-User-Role": "admin"},
    )
    assert response.status_code == 422
    assert commits == []
    assert scrub_sizes == []


def test_merge_service_preserves_nested_input_data():
    from record_merge_service import merge_record_cluster

    records = [
        {"record_id": "master"},
        {"record_id": "archive", "metadata": {"tags": ["original"]}},
    ]
    merged = merge_record_cluster(records)
    merged["archived_records"][0]["metadata"]["tags"].append("changed")
    assert records[1]["metadata"]["tags"] == ["original"]
