import csv
import os
import sqlite3
import tempfile
import time

from open_payments_ingestion import get_payments_by_npi, ingest_open_payments_csv


def _write_open_payments_csv(path: str, record_count: int = 500_000) -> None:
    unique_npis = [f"{1000000000 + i}" for i in range(500)]
    with open(path, "w", newline="") as csv_file:
        writer = csv.writer(csv_file)
        writer.writerow([
            "Covered Recipient NPI",
            "Total Amount of Payment (USD)",
            "Nature of Payment",
            "Date of Payment",
            "Payer/Manufacturer Name",
        ])

        for idx in range(record_count):
            npi = unique_npis[idx % len(unique_npis)]
            writer.writerow([
                npi,
                f"{(idx % 2500) + 12.50:.2f}",
                "Consulting Fee" if idx % 2 == 0 else "Travel",
                "2024-01-15" if idx % 3 == 0 else "2024-02-20",
                f"Manufacturer {idx % 25}",
            ])


def test_open_payments_ingestion_indexed_lookup_and_zero_record_case():
    with tempfile.TemporaryDirectory() as tmpdir:
        csv_path = os.path.join(tmpdir, "cms_op.csv")
        db_path = os.path.join(tmpdir, "open_payments.sqlite")

        _write_open_payments_csv(csv_path, record_count=500_000)

        result = ingest_open_payments_csv(csv_path, db_path=db_path)
        assert result["total_rows_inserted"] == 500_000
        assert result["batches_processed"] > 0

        conn = sqlite3.connect(db_path)
        index_names = conn.execute("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='open_payments'").fetchall()
        conn.close()
        assert any("idx_open_payments_npi" in name for name, in index_names)

        lookup = get_payments_by_npi("1000000000", db_path=db_path)
        assert lookup["count"] > 0
        assert lookup["npi"] == "1000000000"
        assert isinstance(lookup["total_amount"], float)
        assert isinstance(lookup["average_amount"], float)
        assert isinstance(lookup["records"][0]["total_amount"], float)

        zero_lookup = get_payments_by_npi("9999999999", db_path=db_path)
        assert zero_lookup["count"] == 0
        assert zero_lookup["records"] == []


def test_open_payments_lookup_latency_under_50ms():
    with tempfile.TemporaryDirectory() as tmpdir:
        csv_path = os.path.join(tmpdir, "cms_op.csv")
        db_path = os.path.join(tmpdir, "open_payments.sqlite")

        _write_open_payments_csv(csv_path, record_count=500_000)
        ingest_open_payments_csv(csv_path, db_path=db_path)

        latencies: list[float] = []
        for _ in range(20):
            start = time.perf_counter()
            result = get_payments_by_npi("1000000000", db_path=db_path)
            elapsed_ms = (time.perf_counter() - start) * 1000.0
            latencies.append(elapsed_ms)
            assert result["count"] > 0

        average_latency = sum(latencies) / len(latencies)
        assert average_latency < 50.0, f"Average latency {average_latency:.2f}ms exceeded 50ms"
        assert any(latency < 50.0 for latency in latencies)
