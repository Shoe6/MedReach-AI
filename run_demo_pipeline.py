"""Run the curated provider walkthrough against the local FastAPI backend."""

from __future__ import annotations

import csv
import io
import json
from pathlib import Path
from typing import Any

import requests

BASE_URL = "http://127.0.0.1:8000"
COMPANY_ID = "demo-company"
CSV_PATH = Path(__file__).with_name("curated_walkthrough_batch.csv")
TIMEOUT_SECONDS = 30
PERSONA_IDS = {
    "persona-a-statistical-anomaly",
    "persona-b-npi-failure",
    "persona-c-financial-conflict",
}


def _fail(response: requests.Response) -> None:
    if response.status_code not in (200, 201):
        print(
            f"Request failed ({response.status_code}) {response.request.method} "
            f"{response.request.url}:\n{response.text}"
        )
        raise SystemExit(1)


def _request(method: str, url: str, **kwargs: Any) -> requests.Response:
    try:
        response = requests.request(method, url, timeout=TIMEOUT_SECONDS, **kwargs)
    except requests.RequestException as exc:
        print(f"Request failed before receiving a response: {exc}")
        raise SystemExit(1) from exc
    _fail(response)
    return response


def _parse_export(response: requests.Response) -> list[dict[str, Any]]:
    content_type = response.headers.get("content-type", "").lower()
    if "json" in content_type:
        payload = response.json()
        if isinstance(payload, list):
            return payload
        if isinstance(payload, dict) and isinstance(payload.get("records"), list):
            return payload["records"]
        return [payload]

    return [dict(row) for row in csv.DictReader(io.StringIO(response.text))]


def _persona_summary(records: list[dict[str, Any]]) -> dict[str, Any]:
    summary: dict[str, Any] = {}
    for record in records:
        provider_id = record.get("provider_id")
        if provider_id in PERSONA_IDS:
            summary[str(provider_id)] = {
                key: value
                for key, value in record.items()
                if key in {
                    "provider_id",
                    "npi",
                    "npi_status",
                    "anomaly_flag",
                    "is_anomaly",
                    "anomaly_explanation",
                    "sunshine_act_flag",
                    "sunshine_metadata",
                    "validation_error_flag",
                    "metadata",
                    "is_duplicate",
                }
            }
    return summary


def main() -> None:
    if not CSV_PATH.is_file():
        print(f"Input file not found: {CSV_PATH}")
        raise SystemExit(1)

    with CSV_PATH.open("rb") as csv_file:
        upload_response = _request(
            "POST",
            f"{BASE_URL}/api/companies/{COMPANY_ID}/upload_file",
            files={"file": (CSV_PATH.name, csv_file, "text/csv")},
        )
    upload_payload = upload_response.json()
    preview_data = upload_payload.get("preview_data")
    if not isinstance(preview_data, list):
        print(f"Upload response did not contain a preview_data array:\n{upload_response.text}")
        raise SystemExit(1)

    merge_response = _request(
        "POST",
        f"{BASE_URL}/api/companies/{COMPANY_ID}/records/merge",
        json={"records": preview_data},
    )
    merge_payload = merge_response.json()

    export_response = _request(
        "GET",
        f"{BASE_URL}/api/companies/{COMPANY_ID}/export_data",
    )
    exported_records = _parse_export(export_response)

    result = {
        "upload": {
            "status_code": upload_response.status_code,
            "total_rows": upload_payload.get("total_rows"),
            "preview_rows": len(preview_data),
            "duplicate_clusters": upload_payload.get("duplicate_clusters", []),
        },
        "merge": {
            "status_code": merge_response.status_code,
            "master_record_id": merge_payload.get("master_record_id"),
            "archived_record_count": len(merge_payload.get("archived_records", [])),
        },
        "export": {
            "status_code": export_response.status_code,
            "record_count": len(exported_records),
            "persona_records": _persona_summary(exported_records),
        },
    }
    print(json.dumps(result, indent=2, default=str))


if __name__ == "__main__":
    main()
