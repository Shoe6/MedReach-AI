"""End-to-end verification of the real frontend upload path against the live
Cloud Run backend and live Firestore database.

Mirrors exactly what src/App.tsx's uploadRealFile() does:
  1. POST /api/upload/generate-url  (signed GCS v4 PUT URL)
  2. PUT the raw file bytes to that signed URL
  3. Client-side parse the CSV into JSON records
  4. POST /api/companies/{company_id}/records/merge with those records
  5. GET  /api/companies/{company_id}/export_data to see what actually landed

Each CSV is ingested into its own disposable test company (e2e-test-<file>-<uuid>)
so nothing here touches demo-company or other real tenant data.

Usage: python verify_upload_pipeline_e2e.py
"""
from __future__ import annotations

import csv
import io
import json
import sys
from pathlib import Path
from uuid import uuid4

import requests

BASE_URL = "https://medreach-ai-655qt2cxwq-ue.a.run.app"
ROLE_HEADER = {"X-User-Role": "editor"}
TIMEOUT = 60

# Large registry extracts are sampled to keep a single synchronous Firestore
# write request from timing out — the backend writes one document per row.
MAX_ROWS_PER_FILE = 25

TEST_FILES = [
    Path("tests/test_clean.csv"),
    Path("tests/test_duplicates_outliers.csv"),
    Path("tests/test_privacy_leaks.csv"),
    Path("tests/DAC_Synthetic_Sensitive_Sample.csv"),
    Path("tests/DAC_Test_Sample.csv"),
]


def parse_csv(path: Path, limit: int | None = None) -> list[dict[str, str]]:
    with path.open("r", encoding="utf-8-sig", newline="") as fh:
        reader = csv.DictReader(fh)
        rows = []
        for row in reader:
            rows.append({k: (v or "").strip() for k, v in row.items()})
            if limit and len(rows) >= limit:
                break
        return rows


def run_one(path: Path) -> dict:
    result: dict = {"file": str(path), "issues": []}
    company_id = f"e2e-test-{path.stem.lower().replace('_', '-')}-{uuid4().hex[:8]}"
    result["company_id"] = company_id

    input_rows = parse_csv(path, limit=MAX_ROWS_PER_FILE)
    result["input_row_count"] = len(input_rows)
    if not input_rows:
        result["issues"].append("CSV produced zero parsed rows")
        return result

    # Step 1 — signed URL generation (mirrors uploadRealFile's first fetch)
    gen_res = requests.post(
        f"{BASE_URL}/api/upload/generate-url",
        headers={**ROLE_HEADER, "Content-Type": "application/json"},
        json={"company_id": company_id, "filename": path.name, "content_type": "text/csv"},
        timeout=TIMEOUT,
    )
    result["generate_url_status"] = gen_res.status_code
    if gen_res.status_code != 200:
        result["issues"].append(f"generate-url returned {gen_res.status_code}: {gen_res.text[:300]}")
        return result
    upload_url = gen_res.json().get("upload_url")

    # Step 2 — direct-to-GCS PUT of the raw file bytes
    file_bytes = path.read_bytes()
    put_res = requests.put(
        upload_url,
        data=file_bytes,
        headers={"Content-Type": "text/csv"},
        timeout=TIMEOUT,
    )
    result["gcs_put_status"] = put_res.status_code
    if put_res.status_code not in (200, 201):
        result["issues"].append(f"GCS PUT returned {put_res.status_code}: {put_res.text[:300]}")

    # Step 3/4 — merge the parsed records (this is the call the frontend
    # actually relies on to persist data into Firestore)
    merge_res = requests.post(
        f"{BASE_URL}/api/companies/{company_id}/records/merge",
        headers={**ROLE_HEADER, "Content-Type": "application/json"},
        json={"records": input_rows},
        timeout=TIMEOUT,
    )
    result["merge_status"] = merge_res.status_code
    if merge_res.status_code >= 500:
        result["issues"].append(f"records/merge returned {merge_res.status_code}: {merge_res.text[:500]}")
        return result
    if merge_res.status_code != 200:
        result["issues"].append(f"records/merge returned {merge_res.status_code}: {merge_res.text[:500]}")
        return result

    merge_json = merge_res.json()
    archived_count = len(merge_json.get("archived_records", []))
    result["merge_response_archived_count"] = archived_count
    result["merge_response_has_master"] = "merged_record" in merge_json

    # Step 5 — read back what Firestore actually stored
    export_res = requests.get(
        f"{BASE_URL}/api/companies/{company_id}/export_data",
        timeout=TIMEOUT,
    )
    result["export_status"] = export_res.status_code
    if export_res.status_code != 200:
        result["issues"].append(f"export_data returned {export_res.status_code}: {export_res.text[:300]}")
        return result

    stored_records = export_res.json().get("records", [])
    result["stored_record_count"] = len(stored_records)

    # ── Payload-mismatch checks ──────────────────────────────────────────
    if result["stored_record_count"] != result["input_row_count"]:
        result["issues"].append(
            f"Row count mismatch: uploaded {result['input_row_count']} distinct rows but "
            f"Firestore holds {result['stored_record_count']} documents with correct per-row "
            f"field data (1 blended 'master' + {archived_count} untouched 'archived' copies "
            f"instead of {result['input_row_count']} independent provider records)."
        )

    # Spot-check: does any single stored document contain a blend of two
    # different input providers' fields (proof of the whole-batch merge bug)?
    if len(input_rows) >= 2:
        first_row_name = (input_rows[0].get("first_name") or input_rows[0].get("Provider First Name") or "").strip()
        second_row_npi = (input_rows[1].get("NPI") or input_rows[1].get("npi") or "").strip()
        for doc in stored_records:
            doc_first_name = str(doc.get("first_name") or doc.get("Provider First Name") or "").strip()
            doc_npi = str(doc.get("NPI") or doc.get("npi") or "").strip()
            if first_row_name and doc_first_name == first_row_name and second_row_npi and doc_npi == second_row_npi:
                result["issues"].append(
                    f"Blended record detected: document carries row 1's name ('{first_row_name}') "
                    f"with row 2's NPI ('{second_row_npi}') — confirms distinct rows were merged "
                    "into a single Firestore document."
                )
                break

    return result


def main() -> int:
    report = []
    for path in TEST_FILES:
        if not path.exists():
            report.append({"file": str(path), "issues": [f"File not found: {path}"]})
            continue
        print(f"Running {path} ...", file=sys.stderr)
        report.append(run_one(path))

    print(json.dumps(report, indent=2, default=str))

    total_issues = sum(len(r.get("issues", [])) for r in report)
    print(f"\n{'='*70}\nTOTAL ISSUES FOUND: {total_issues}\n{'='*70}", file=sys.stderr)
    return 1 if total_issues else 0


if __name__ == "__main__":
    raise SystemExit(main())
