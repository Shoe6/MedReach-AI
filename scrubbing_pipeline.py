"""Async record scrubbing orchestration for uploaded provider datasets."""

from __future__ import annotations

import asyncio
from typing import Any

import pandas as pd

from dbscan_fallback_service import detect_anomalies_dynamic
from npi_registry_client import CMSNPIRegistryClient
from npi_status_enrichment import enrich_provider_with_npi_status
from pii_detection_service import scan_text_for_pii

OFFLINE_NPI_STATUS = "unvalidated_offline"


def _run_local_scrubbing(records: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Run local PII and anomaly checks without network dependencies."""
    result = [dict(record) for record in records]
    for record in result:
        text = " ".join(str(value) for value in record.values() if value is not None)
        detections = scan_text_for_pii(text)
        record["pii_detections"] = detections
        record["pii_flagged"] = bool(detections)

    frame = pd.DataFrame(result)
    numeric_columns = frame.select_dtypes(include=["number"]).columns.tolist()
    if numeric_columns and len(frame) > 1:
        scored = detect_anomalies_dynamic(frame[numeric_columns], variance_threshold=1.0)
        for index, record in enumerate(result):
            record["anomaly_flag"] = int(scored.iloc[index]["anomaly_flag"])
            record["detection_model_used"] = scored.iloc[index]["detection_model_used"]
    else:
        for record in result:
            record["anomaly_flag"] = 1
            record["detection_model_used"] = "none"

    return result


async def scrub_provider_records(records: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Run NPI validation, PII detection, and anomaly detection for a batch."""
    if not records:
        return []

    npis = [str(record.get("npi") or "").strip() for record in records]
    unique_npis = list(dict.fromkeys(npi for npi in npis if npi))

    async with CMSNPIRegistryClient(timeout=2.0) as npi_client:
        npi_task = asyncio.create_task(npi_client.fetch_many(unique_npis))
        local_task = asyncio.create_task(asyncio.to_thread(_run_local_scrubbing, records))
        payloads, scrubbed_records = await asyncio.gather(npi_task, local_task)

    payload_by_npi = {
        str(payload.get("number")): payload
        for payload in payloads
        if isinstance(payload, dict) and payload.get("number")
    }
    offline_npis = {
        npi for npi, payload in zip(unique_npis, payloads) if not payload
    }

    enriched_records: list[dict[str, Any]] = []
    for record in scrubbed_records:
        npi = str(record.get("npi") or "").strip()
        payload = payload_by_npi.get(npi, {})
        enriched = enrich_provider_with_npi_status(record, payload)
        if npi in offline_npis:
            enriched["npi_status"] = OFFLINE_NPI_STATUS
            enriched["validation_status"] = OFFLINE_NPI_STATUS
        enriched_records.append(enriched)

    return enriched_records


__all__ = ["OFFLINE_NPI_STATUS", "scrub_provider_records"]