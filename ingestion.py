import math
import tracemalloc
from collections import defaultdict
from typing import Any

import pandas as pd

from heuristics import infer_column_types


def _json_safe(value: Any) -> Any:
    """Convert Pandas/NumPy values into JSON-safe Python native types."""
    if value is None:
        return None
    if isinstance(value, dict):
        return {str(key): _json_safe(val) for key, val in value.items()}
    if isinstance(value, list):
        return [_json_safe(item) for item in value]
    if isinstance(value, tuple):
        return [_json_safe(item) for item in value]
    if isinstance(value, float):
        if math.isnan(value) or math.isinf(value):
            return None
        return value
    try:
        if pd.isna(value):
            return None
    except Exception:
        pass
    return value


def _normalize_text(value: Any) -> str:
    """Normalize a value for duplicate matching and similarity comparisons."""
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return ""
    return str(value).strip().lower().replace("-", "").replace(" ", "")


def detect_duplicate_clusters(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Group records that appear to be duplicates based on NPI, email, or name+phone matches."""
    buckets: dict[tuple[str, str], list[int]] = defaultdict(list)

    for row_index, row in enumerate(rows):
        record = row or {}
        npi = str(record.get("npi") or record.get("NPI") or "").strip()
        if npi and npi != "nan":
            buckets[("npi", npi)].append(row_index)

        email = str(record.get("email") or record.get("email_address") or "").strip().lower()
        if email and email != "nan":
            buckets[("email", email)].append(row_index)

        first_name = str(record.get("first_name") or record.get("firstName") or "").strip()
        last_name = str(record.get("last_name") or record.get("lastName") or "").strip()
        phone = str(record.get("phone") or record.get("telephone") or record.get("phone_number") or "").strip()
        name_key = " ".join(part for part in [first_name, last_name] if part).strip().lower()
        normalized_phone = _normalize_text(phone)
        if name_key and normalized_phone:
            buckets[("name_phone", f"{_normalize_text(name_key)}|{normalized_phone}")].append(row_index)

    clusters: list[dict[str, Any]] = []
    seen: set[tuple[str, str]] = set()

    for (match_type, key), indexes in buckets.items():
        if len(indexes) < 2:
            continue
        if (match_type, key) in seen:
            continue
        seen.add((match_type, key))

        records = []
        for idx in indexes:
            row = rows[idx]
            records.append(
                {
                    "row_index": idx,
                    "npi": row.get("npi") or row.get("NPI"),
                    "first_name": row.get("first_name") or row.get("firstName"),
                    "last_name": row.get("last_name") or row.get("lastName"),
                    "email": row.get("email") or row.get("email_address"),
                    "phone": row.get("phone") or row.get("telephone") or row.get("phone_number"),
                }
            )

        similarity = 99 if match_type == "npi" else 96 if match_type == "email" else 90
        clusters.append(
            {
                "cluster_id": f"{match_type}-{len(clusters) + 1}",
                "match_type": match_type,
                "similarity_percent": similarity,
                "records": records,
            }
        )

    return clusters


def ingest_csv_chunks(file_obj) -> dict[str, Any]:
    """Read a CSV in 5K-row chunks, track chunked memory usage, infer column types, and detect duplicate clusters."""
    tracemalloc.start()
    total_rows = 0
    columns = []
    preview_data = []
    inferred_schema = {}
    first_chunk = True
    all_rows: list[dict[str, Any]] = []

    try:
        for chunk in pd.read_csv(file_obj, chunksize=5000):
            if first_chunk:
                columns = list(chunk.columns)
                preview_data = chunk.head(5).to_dict(orient="records")
                inferred_schema = infer_column_types(columns, preview_data)
                first_chunk = False

            all_rows.extend(chunk.to_dict(orient="records"))
            total_rows += len(chunk)
    finally:
        current, peak = tracemalloc.get_traced_memory()
        tracemalloc.stop()

    return {
        "total_rows": total_rows,
        "columns": columns,
        "preview_data": _json_safe(preview_data),
        "inferred_schema": {str(key): str(value) for key, value in inferred_schema.items()},
        "duplicate_clusters": detect_duplicate_clusters(_json_safe(all_rows)),
        "peak_memory_mb": round(peak / (1024 * 1024), 4),
    }
