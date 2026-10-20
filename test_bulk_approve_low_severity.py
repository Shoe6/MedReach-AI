"""Tests for the 'Approve All Low-Severity' bulk Firestore batched writes (MA-XX)."""
import time
from uuid import uuid4

from fastapi.testclient import TestClient

from bulk_approval_service import (
    MAX_BATCH_SIZE,
    approve_documents_in_batches,
    approve_low_severity_flags,
)
from database import db
from main import app

client = TestClient(app)


def test_1000_documents_split_into_two_batches_under_1_5_seconds():
    """1,000 flagged records should be approved via two 500-doc batches in < 1.5s."""
    company_id = f"test-bulk-approve-{uuid4()}"
    flags_ref = db.collection("companies").document(company_id).collection("flags")
    doc_refs = [flags_ref.document(f"flag-{i}") for i in range(1000)]
    for ref in doc_refs:
        ref.set({"category": "pii", "severity": "Low", "resolved": False})

    start = time.perf_counter()
    result = approve_documents_in_batches(db, doc_refs)
    elapsed = time.perf_counter() - start

    assert result["approved_count"] == 1000
    assert result["batch_count"] == 2
    assert elapsed < 1.5, f"Bulk approval took {elapsed:.2f}s, expected under 1.5s"

    for ref in doc_refs[:5] + doc_refs[-5:]:
        data = ref.get().to_dict()
        assert data["resolved"] is True
        assert data["approved"] is True


def test_batch_size_never_exceeds_firestore_limit():
    company_id = f"test-bulk-approve-cap-{uuid4()}"
    flags_ref = db.collection("companies").document(company_id).collection("flags")
    doc_refs = [flags_ref.document(f"flag-{i}") for i in range(501)]
    for ref in doc_refs:
        ref.set({"severity": "Low", "resolved": False})

    result = approve_documents_in_batches(db, doc_refs)

    assert result["approved_count"] == 501
    assert result["batch_count"] == 2
    assert MAX_BATCH_SIZE == 500


def test_approve_low_severity_flags_only_touches_unresolved_low_severity():
    company_id = f"test-bulk-approve-query-{uuid4()}"
    flags_ref = db.collection("companies").document(company_id).collection("flags")
    for i in range(3):
        flags_ref.document(f"low-{i}").set({"category": "outliers", "severity": "Low", "resolved": False})
    flags_ref.document("high-0").set({"category": "npi_validation", "severity": "High", "resolved": False})
    flags_ref.document("low-resolved").set({"category": "pii", "severity": "Low", "resolved": True})

    result = approve_low_severity_flags(db, company_id)

    assert result["approved_count"] == 3
    assert result["batch_count"] == 1
    assert flags_ref.document("high-0").get().to_dict()["resolved"] is False


def test_approve_low_severity_endpoint_bulk_approves_and_blocks_viewers():
    company_id = f"test-bulk-approve-endpoint-{uuid4()}"
    flags_ref = db.collection("companies").document(company_id).collection("flags")
    doc_refs = [flags_ref.document(f"flag-{i}") for i in range(50)]
    for ref in doc_refs:
        ref.set({"category": "duplicates", "severity": "Low", "resolved": False})

    viewer_response = client.post(
        f"/api/companies/{company_id}/flags/approve-low-severity",
        json={},
        headers={"X-User-Role": "viewer"},
    )
    assert viewer_response.status_code == 403

    response = client.post(
        f"/api/companies/{company_id}/flags/approve-low-severity",
        json={},
        headers={"X-User-Role": "editor"},
    )

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["company_id"] == company_id
    assert body["approved_count"] == 50
    assert body["batch_count"] == 1
