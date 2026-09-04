from __future__ import annotations

from copy import deepcopy
from typing import Any, Iterable


def _clean_value(value: Any) -> Any:
    """Normalize empty and null-like values to avoid merging blank fields over real data."""
    if value is None:
        return ""
    if isinstance(value, str):
        return value.strip()
    return value


def _prefer_non_empty(master_value: Any, candidate_value: Any) -> Any:
    """Keep the most informative value while ignoring blank strings and None."""
    if master_value in (None, ""):
        return candidate_value
    return master_value


def merge_record_cluster(records: Iterable[dict[str, Any]], master_record_id: str | None = None) -> dict[str, Any]:
    """Merge a duplicate cluster into one master record and archive the remaining records.

    Rules:
    - Preserve the first record as master unless a specific master id is provided.
    - Prefer non-empty values over empty strings/None when combining fields.
    - Keep a list of archived records with their original payloads.
    - Return a single merged payload plus archived records metadata.
    """
    record_list = [deepcopy(record) for record in records if isinstance(record, dict)]
    if not record_list:
        raise ValueError("No records were provided for merge.")

    if master_record_id is None:
        master = record_list[0]
        archived = record_list[1:]
    else:
        master = next((rec for rec in record_list if str(rec.get("record_id")) == str(master_record_id)), record_list[0])
        archived = [rec for rec in record_list if rec is not master]

    merged = {str(key): _clean_value(value) for key, value in master.items()}

    for record in archived:
        for key, value in record.items():
            if key == "record_id":
                continue
            cleaned_value = _clean_value(value)
            if cleaned_value in (None, ""):
                continue
            existing_value = merged.get(key, "")
            merged[key] = _prefer_non_empty(existing_value, cleaned_value)

    return {
        "master_record": merged,
        "archived_records": [
            {str(key): _clean_value(value) for key, value in rec.items()}
            for rec in archived
        ],
    }
