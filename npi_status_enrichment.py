"""NPI Status Classification & Enrichment service (MA-31).

Classifies a provider's NPI status from a parsed CMS NPI Registry API payload
(as returned by ``npi_registry_client.CMSNPIRegistryClient``) and enriches the
associated provider record with the classification and, where warranted, a
high-severity validation error flag.
"""

from __future__ import annotations

from typing import Any, Iterable

import pandas as pd

ACTIVE = "Active"
INACTIVE = "Inactive"
DEACTIVATED = "Deactivated"
UNVALIDATED = "Unvalidated"

HIGH_SEVERITY_STATUSES = frozenset({DEACTIVATED, UNVALIDATED})


def classify_npi_status(npi_payload: Any) -> str:
    """Classify a CMS NPI Registry payload into Active/Inactive/Deactivated/Unvalidated."""
    if not isinstance(npi_payload, dict) or not npi_payload:
        return UNVALIDATED

    basic = npi_payload.get("basic")
    if not isinstance(basic, dict) or "status" not in basic:
        return UNVALIDATED

    status = basic.get("status")
    if status == "A":
        return ACTIVE
    if status == "I":
        deactivation_date = basic.get("deactivation_date")
        reactivation_date = basic.get("reactivation_date")
        if deactivation_date and not reactivation_date:
            return DEACTIVATED
        return INACTIVE

    return UNVALIDATED


def enrich_provider_with_npi_status(record: dict[str, Any], npi_payload: Any) -> dict[str, Any]:
    """Return a copy of ``record`` enriched with ``npi_status`` and, if warranted, a validation error flag."""
    npi_status = classify_npi_status(npi_payload)

    enriched = dict(record)
    enriched["npi_status"] = npi_status

    if npi_status in HIGH_SEVERITY_STATUSES:
        metadata = dict(enriched.get("metadata") or {})
        metadata["validation_error_flag"] = {
            "severity": "High",
            "reason": f"NPI status classified as {npi_status}",
        }
        enriched["metadata"] = metadata

    return enriched


def enrich_provider_records_with_npi_status(
    provider_records: "Iterable[dict[str, Any]] | pd.DataFrame",
    npi_payloads: "dict[str, dict[str, Any]] | Iterable[dict[str, Any]]",
) -> list[dict[str, Any]]:
    """Batch variant matching provider records to CMS payloads by NPI.

    ``npi_payloads`` may be a dict keyed by NPI, or an iterable of raw CMS
    payload dicts (each containing a ``number`` field) as returned by
    ``CMSNPIRegistryClient.fetch_many``.
    """
    if isinstance(provider_records, pd.DataFrame):
        records = provider_records.to_dict(orient="records")
    else:
        records = [dict(record) for record in provider_records]

    if isinstance(npi_payloads, dict):
        payload_lookup = npi_payloads
    else:
        payload_lookup = {
            str(payload.get("number")): payload
            for payload in npi_payloads
            if isinstance(payload, dict) and payload.get("number")
        }

    results: list[dict[str, Any]] = []
    for record in records:
        npi = str(record.get("npi") or "").strip()
        payload = payload_lookup.get(npi, {})
        results.append(enrich_provider_with_npi_status(record, payload))

    return results


__all__ = [
    "ACTIVE",
    "INACTIVE",
    "DEACTIVATED",
    "UNVALIDATED",
    "classify_npi_status",
    "enrich_provider_with_npi_status",
    "enrich_provider_records_with_npi_status",
]
