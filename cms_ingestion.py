"""CMS public dataset ingestion for pipeline scalability testing (MA-64)."""
import logging
import sys
from typing import Any

import pandas as pd

from dbscan_fallback_service import detect_anomalies_dynamic
from ingestion import detect_duplicate_clusters

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

CHUNK_SIZE = 5000

# Maps raw CMS "National Downloadable File" column names to our internal schema.
CMS_COLUMN_MAP = {
    "NPI": "npi",
    "Provider First Name": "first_name",
    "Provider Last Name": "last_name",
    "Medical school name": "medical_school",
    "Graduation year": "graduation_year",
    "Primary specialty": "specialty",
    "Phone Number": "phone",
    "Email Address": "email",
}

REQUIRED_PII_COLUMNS = ("npi", "first_name", "last_name", "email")


def _map_cms_columns(chunk: pd.DataFrame) -> pd.DataFrame:
    """Rename known CMS columns to our internal schema, leaving unmapped columns untouched."""
    return chunk.rename(columns=CMS_COLUMN_MAP)


def _flag_missing_pii(mapped_chunk: pd.DataFrame) -> pd.DataFrame:
    """Mark rows missing any required PII field so they can be reviewed downstream."""
    present_columns = [col for col in REQUIRED_PII_COLUMNS if col in mapped_chunk.columns]
    if not present_columns:
        mapped_chunk["missing_pii"] = True
        return mapped_chunk
    mapped_chunk["missing_pii"] = mapped_chunk[present_columns].isna().any(axis=1) | (
        mapped_chunk[present_columns].astype(str).apply(lambda col: col.str.strip() == "").any(axis=1)
    )
    return mapped_chunk


def ingest_cms_dataset(file_path: str, variance_threshold: float = 1.0) -> dict[str, Any]:
    """Stream a large CMS CSV in chunks, mapping columns and flagging anomalies/missing PII/duplicates."""
    total_rows = 0
    anomaly_rows = 0
    missing_pii_rows = 0
    duplicate_clusters: list[dict[str, Any]] = []
    all_rows: list[dict[str, Any]] = []

    for chunk in pd.read_csv(file_path, chunksize=CHUNK_SIZE):
        mapped_chunk = _map_cms_columns(chunk)
        mapped_chunk = _flag_missing_pii(mapped_chunk)

        numeric_only = mapped_chunk.select_dtypes(include=["number", "bool"])
        if not numeric_only.empty:
            scored_chunk = detect_anomalies_dynamic(numeric_only, variance_threshold=variance_threshold)
            mapped_chunk["anomaly_flag"] = scored_chunk["anomaly_flag"]
        else:
            mapped_chunk["anomaly_flag"] = 1

        total_rows += len(mapped_chunk)
        anomaly_rows += int((mapped_chunk["anomaly_flag"] == -1).sum())
        missing_pii_rows += int(mapped_chunk["missing_pii"].sum())
        all_rows.extend(mapped_chunk.to_dict(orient="records"))

        logger.info("Processed chunk: %s rows... (total so far: %s)", len(mapped_chunk), total_rows)

    duplicate_clusters = detect_duplicate_clusters(all_rows)

    return {
        "total_rows": total_rows,
        "anomaly_rows": anomaly_rows,
        "missing_pii_rows": missing_pii_rows,
        "duplicate_clusters": duplicate_clusters,
    }


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python cms_ingestion.py <path_to_cms_csv>")
        sys.exit(1)

    summary = ingest_cms_dataset(sys.argv[1])
    logger.info(
        "Ingestion complete: %s rows, %s anomalies, %s missing PII, %s duplicate clusters",
        summary["total_rows"],
        summary["anomaly_rows"],
        summary["missing_pii_rows"],
        len(summary["duplicate_clusters"]),
    )
