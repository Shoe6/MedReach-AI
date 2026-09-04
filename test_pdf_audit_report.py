import time

from pdf_audit_report_service import generate_audit_pdf


def _mock_audit_events(count: int = 25) -> list[dict]:
    return [
        {
            "action_type": "PII Override" if i % 3 == 0 else "Data Scrubbing",
            "record_id": f"REC-{1000 + i}",
            "timestamp": f"2026-08-{(i % 28) + 1:02d}T12:00:00Z",
            "description": f"Automated redaction review for record {1000 + i} completed by analyst.",
        }
        for i in range(count)
    ]


def _mock_metrics() -> dict:
    return {
        "total_records_processed": 5000,
        "anomalies_flagged": 42,
        "pii_redacted": 118,
    }


def test_generate_audit_pdf_creates_valid_non_empty_file(tmp_path):
    output_path = tmp_path / "audit_report.pdf"

    result_path = generate_audit_pdf(_mock_audit_events(), _mock_metrics(), str(output_path))

    assert result_path == str(output_path)
    assert output_path.exists()
    assert output_path.stat().st_size > 0

    with open(output_path, "rb") as pdf_file:
        header = pdf_file.read(5)
    assert header == b"%PDF-"


def test_generate_audit_pdf_handles_empty_events_list(tmp_path):
    output_path = tmp_path / "empty_audit_report.pdf"

    generate_audit_pdf([], _mock_metrics(), str(output_path))

    assert output_path.exists()
    assert output_path.stat().st_size > 0


def test_generate_audit_pdf_completes_under_three_seconds(tmp_path):
    output_path = tmp_path / "perf_audit_report.pdf"

    start = time.perf_counter()
    generate_audit_pdf(_mock_audit_events(count=200), _mock_metrics(), str(output_path))
    elapsed = time.perf_counter() - start

    assert elapsed < 3.0
    assert output_path.stat().st_size > 0
