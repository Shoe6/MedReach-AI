from __future__ import annotations

import sqlite3
from pathlib import Path
from typing import Any, Iterable

import pandas as pd


DEFAULT_DB_PATH = "open_payments.db"
DEFAULT_TABLE_NAME = "open_payments"


def _normalize_npi(value: Any) -> str:
    if value is None or value == "":
        return ""
    text = str(value).strip()
    if text.lower() == "nan":
        return ""
    digits = "".join(ch for ch in text if ch.isdigit())
    return digits


def _normalize_amount(value: Any) -> float:
    if value is None or value == "":
        return 0.0
    if isinstance(value, (int, float)):
        return float(value)
    text = str(value).strip().replace(",", "")
    if text.lower() in {"nan", "none", "null", "n/a"}:
        return 0.0
    try:
        return float(text)
    except ValueError:
        return 0.0


def _normalize_text(value: Any) -> str:
    if value is None or value == "":
        return ""
    text = str(value).strip()
    if text.lower() in {"nan", "none", "null"}:
        return ""
    return text


def _normalize_date(value: Any) -> str:
    if value is None or value == "":
        return ""
    text = str(value).strip()
    if text.lower() in {"nan", "none", "null"}:
        return ""
    return text


def ensure_open_payments_table(db_path: str = DEFAULT_DB_PATH, table_name: str = DEFAULT_TABLE_NAME) -> sqlite3.Connection:
    path = Path(db_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(path))
    conn.execute(
        f"""
        CREATE TABLE IF NOT EXISTS {table_name} (
            id INTEGER PRIMARY KEY,
            npi TEXT,
            total_amount REAL,
            nature_of_payment TEXT,
            date_of_payment TEXT,
            payer_name TEXT
        )
        """
    )
    conn.execute(f"CREATE INDEX IF NOT EXISTS idx_{table_name}_npi ON {table_name}(npi)")
    conn.commit()
    return conn


def _iter_open_payments_rows(csv_source: str, chunksize: int = 50_000) -> Iterable[pd.DataFrame]:
    if csv_source.startswith(("http://", "https://")):
        yield from pd.read_csv(csv_source, chunksize=chunksize, low_memory=False)
        return
    yield from pd.read_csv(csv_source, chunksize=chunksize, low_memory=False)


def ingest_open_payments_csv(
    csv_source: str,
    db_path: str = DEFAULT_DB_PATH,
    table_name: str = DEFAULT_TABLE_NAME,
    chunksize: int = 50_000,
) -> dict[str, Any]:
    conn = ensure_open_payments_table(db_path=db_path, table_name=table_name)
    cursor = conn.cursor()
    total_rows = 0
    total_batches = 0

    for chunk in _iter_open_payments_rows(csv_source, chunksize=chunksize):
        normalized = chunk.rename(columns={
            "Covered Recipient NPI": "npi",
            "Total Amount of Payment (USD)": "total_amount",
            "Nature of Payment": "nature_of_payment",
            "Date of Payment": "date_of_payment",
            "Payer/Manufacturer Name": "payer_name",
            "Payer Manufacturer Name": "payer_name",
            "Covered Recipient NPI": "npi",
        })

        rows: list[tuple[str, float, str, str, str]] = []
        for _, row in normalized.iterrows():
            npi = _normalize_npi(row.get("npi"))
            total_amount = _normalize_amount(row.get("total_amount"))
            nature_of_payment = _normalize_text(row.get("nature_of_payment"))
            date_of_payment = _normalize_date(row.get("date_of_payment"))
            payer_name = _normalize_text(row.get("payer_name"))

            if not npi:
                continue

            rows.append((npi, total_amount, nature_of_payment, date_of_payment, payer_name))

        if rows:
            cursor.executemany(
                f"INSERT INTO {table_name} (npi, total_amount, nature_of_payment, date_of_payment, payer_name) VALUES (?, ?, ?, ?, ?)",
                rows,
            )
            total_rows += len(rows)
            total_batches += 1

    conn.commit()
    conn.close()

    return {
        "db_path": db_path,
        "table_name": table_name,
        "total_rows_inserted": total_rows,
        "batches_processed": total_batches,
    }


def get_payments_by_npi(npi: str, db_path: str = DEFAULT_DB_PATH, table_name: str = DEFAULT_TABLE_NAME) -> dict[str, Any]:
    normalized_npi = _normalize_npi(npi)
    if not normalized_npi:
        return {
            "npi": "",
            "count": 0,
            "total_amount": 0.0,
            "average_amount": 0.0,
            "records": [],
        }

    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    query = f"SELECT npi, total_amount, nature_of_payment, date_of_payment, payer_name FROM {table_name} WHERE npi = ? ORDER BY date_of_payment DESC"
    records = [dict(row) for row in conn.execute(query, (normalized_npi,)).fetchall()]
    aggregate = conn.execute(
        f"SELECT COUNT(*) AS count, COALESCE(SUM(total_amount), 0) AS total_amount, COALESCE(AVG(total_amount), 0) AS average_amount FROM {table_name} WHERE npi = ?",
        (normalized_npi,),
    ).fetchone()
    conn.close()

    return {
        "npi": normalized_npi,
        "count": int(aggregate["count"]),
        "total_amount": float(aggregate["total_amount"] or 0.0),
        "average_amount": float(aggregate["average_amount"] or 0.0),
        "records": records,
    }


__all__ = [
    "DEFAULT_DB_PATH",
    "DEFAULT_TABLE_NAME",
    "ensure_open_payments_table",
    "ingest_open_payments_csv",
    "get_payments_by_npi",
]
