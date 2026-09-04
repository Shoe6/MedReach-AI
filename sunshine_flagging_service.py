"""Sunshine Act financial relationship flagging service (MA-25).

Flags provider records whose aggregate Open Payments transactions exceed the
federal reporting threshold and attaches supporting metadata.
"""

from __future__ import annotations

import sqlite3
from typing import Any, Iterable

import pandas as pd

from open_payments_ingestion import DEFAULT_DB_PATH, DEFAULT_TABLE_NAME, _normalize_npi

# CMS Open Payments federal reporting threshold (USD).
THRESHOLD_USD = 100.00


def _fetch_transactions_by_npi(
    npi: str,
    db_path: str,
    table_name: str,
) -> list[sqlite3.Row]:
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    try:
        query = (
            f"SELECT total_amount, nature_of_payment, payer_name FROM {table_name} WHERE npi = ?"
        )
        return conn.execute(query, (npi,)).fetchall()
    finally:
        conn.close()


def _build_sunshine_metadata(transactions: list[sqlite3.Row]) -> dict[str, Any]:
    total_amount_usd = sum(float(row["total_amount"] or 0.0) for row in transactions)
    pharmaceutical_companies = sorted({
        row["payer_name"] for row in transactions if row["payer_name"]
    })
    relationship_types = sorted({
        row["nature_of_payment"] for row in transactions if row["nature_of_payment"]
    })
    return {
        "total_amount_usd": total_amount_usd,
        "pharmaceutical_companies": pharmaceutical_companies,
        "relationship_types": relationship_types,
    }


def flag_sunshine_act_relationships(
    provider_records: "Iterable[dict[str, Any]] | pd.DataFrame",
    db_path: str = DEFAULT_DB_PATH,
    table_name: str = DEFAULT_TABLE_NAME,
    threshold_usd: float = THRESHOLD_USD,
) -> list[dict[str, Any]]:
    """Annotate provider records with Sunshine Act flags based on Open Payments data.

    Accepts either an iterable of dicts or a pandas DataFrame containing an
    ``npi`` field. Returns a list of dict copies of the input records, each
    augmented with a ``sunshine_act_flag`` boolean and, when flagged, a
    ``sunshine_metadata`` dict.
    """
    if isinstance(provider_records, pd.DataFrame):
        records = provider_records.to_dict(orient="records")
    else:
        records = [dict(record) for record in provider_records]

    results: list[dict[str, Any]] = []
    for record in records:
        result = dict(record)
        npi = _normalize_npi(result.get("npi"))
        result["sunshine_act_flag"] = False

        if npi:
            transactions = _fetch_transactions_by_npi(npi, db_path=db_path, table_name=table_name)
            if transactions:
                metadata = _build_sunshine_metadata(transactions)
                if metadata["total_amount_usd"] > threshold_usd:
                    result["sunshine_act_flag"] = True
                    result["sunshine_metadata"] = metadata

        results.append(result)

    return results


__all__ = [
    "THRESHOLD_USD",
    "flag_sunshine_act_relationships",
]
