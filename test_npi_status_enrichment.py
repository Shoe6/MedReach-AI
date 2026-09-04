import pandas as pd
import pytest

from npi_status_enrichment import (
    ACTIVE,
    DEACTIVATED,
    INACTIVE,
    UNVALIDATED,
    classify_npi_status,
    enrich_provider_records_with_npi_status,
    enrich_provider_with_npi_status,
)


ACTIVE_PAYLOAD = {
    "number": "1111111111",
    "basic": {"first_name": "Test", "last_name": "Active", "status": "A"},
}

INACTIVE_PAYLOAD = {
    "number": "2222222222",
    "basic": {"first_name": "Test", "last_name": "Inactive", "status": "I"},
}

DEACTIVATED_PAYLOAD = {
    "number": "3333333333",
    "basic": {
        "first_name": "Test",
        "last_name": "Deactivated",
        "status": "I",
        "deactivation_date": "2023-05-01",
        "reactivation_date": "",
    },
}

NOT_FOUND_PAYLOAD: dict = {}

MALFORMED_PAYLOAD = {"number": "4444444444"}  # missing "basic" entirely


@pytest.mark.parametrize(
    "payload,expected_status",
    [
        (ACTIVE_PAYLOAD, ACTIVE),
        (INACTIVE_PAYLOAD, INACTIVE),
        (DEACTIVATED_PAYLOAD, DEACTIVATED),
        (NOT_FOUND_PAYLOAD, UNVALIDATED),
        (MALFORMED_PAYLOAD, UNVALIDATED),
    ],
)
def test_classify_npi_status(payload, expected_status):
    assert classify_npi_status(payload) == expected_status


def test_active_record_is_enriched_without_error_flag():
    record = {"npi": "1111111111", "name": "Dr. Active"}

    result = enrich_provider_with_npi_status(record, ACTIVE_PAYLOAD)

    assert result["npi_status"] == ACTIVE
    assert "metadata" not in result
    assert record == {"npi": "1111111111", "name": "Dr. Active"}  # original untouched


def test_inactive_record_is_enriched_without_error_flag():
    record = {"npi": "2222222222", "name": "Dr. Inactive"}

    result = enrich_provider_with_npi_status(record, INACTIVE_PAYLOAD)

    assert result["npi_status"] == INACTIVE
    assert "metadata" not in result


def test_deactivated_record_receives_high_severity_flag():
    record = {"npi": "3333333333", "name": "Dr. Deactivated"}

    result = enrich_provider_with_npi_status(record, DEACTIVATED_PAYLOAD)

    assert result["npi_status"] == DEACTIVATED
    assert result["metadata"]["validation_error_flag"]["severity"] == "High"


def test_not_found_payload_is_unvalidated_with_high_severity_flag():
    record = {"npi": "9999999999", "name": "Dr. Not Found"}

    result = enrich_provider_with_npi_status(record, NOT_FOUND_PAYLOAD)

    assert result["npi_status"] == UNVALIDATED
    assert result["metadata"]["validation_error_flag"]["severity"] == "High"


def test_malformed_payload_is_unvalidated_with_high_severity_flag():
    record = {"npi": "4444444444", "name": "Dr. Malformed"}

    result = enrich_provider_with_npi_status(record, MALFORMED_PAYLOAD)

    assert result["npi_status"] == UNVALIDATED
    assert result["metadata"]["validation_error_flag"]["severity"] == "High"


def test_enrichment_preserves_existing_metadata():
    record = {"npi": "3333333333", "name": "Dr. Deactivated", "metadata": {"source": "manual"}}

    result = enrich_provider_with_npi_status(record, DEACTIVATED_PAYLOAD)

    assert result["metadata"]["source"] == "manual"
    assert result["metadata"]["validation_error_flag"]["severity"] == "High"


def test_batch_enrichment_matches_records_to_payloads_by_npi():
    records = pd.DataFrame([
        {"npi": "1111111111", "name": "Dr. Active"},
        {"npi": "3333333333", "name": "Dr. Deactivated"},
    ])
    payloads = [ACTIVE_PAYLOAD, DEACTIVATED_PAYLOAD]

    results = enrich_provider_records_with_npi_status(records, payloads)

    assert results[0]["npi_status"] == ACTIVE
    assert "metadata" not in results[0]
    assert results[1]["npi_status"] == DEACTIVATED
    assert results[1]["metadata"]["validation_error_flag"]["severity"] == "High"
