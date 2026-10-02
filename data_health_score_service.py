import re
from decimal import Decimal, ROUND_HALF_UP
from typing import Any


REVIEW_FIELDS = {
    "npi": ("npi", "NPI"),
    "email": ("email", "email_address", "Email", "Email Address"),
    "phone": ("phone", "phone_number", "Telephone Number", "Phone", "Phone Number"),
}


def _value(record: dict[str, Any], field: str) -> str:
    for key in REVIEW_FIELDS[field]:
        value = record.get(key)
        if value is not None and str(value).strip():
            return str(value).strip()
    return ""


def _is_true(value: Any) -> bool:
    return value is True or value == -1 or str(value).lower() in ("true", "1", "merged")


def calculate_data_health(records: list[dict[str, Any]]) -> dict[str, Any]:
    total = len(records)
    supplied = {
        field: any(any(key in record for key in REVIEW_FIELDS[field]) for record in records)
        for field in ("email", "phone")
    }
    counts = {key: 0 for key in ("npi_validation", "contact_completeness", "duplicates", "outliers", "pii_phi")}
    pending_npis = 0
    invalid_statuses = {"invalid", "invalid_npi", "deactivated", "inactive", "not_found", "notfound", "mismatch"}
    for record in records:
        status = re.sub(r"[\s-]+", "_", str(record.get("npi_status") or record.get("validation_status") or "").strip().lower())
        if not re.fullmatch(r"[0-9]{10}", _value(record, "npi")) or status in invalid_statuses:
            counts["npi_validation"] += 1
        elif status not in ("active", "valid"):
            pending_npis += 1
        if any(supplied[field] and not _value(record, field) for field in supplied):
            counts["contact_completeness"] += 1
        if _is_true(record.get("is_duplicate")) or _is_true(record.get("merged_from_sources")) or record.get("deduplication_status") == "merged":
            counts["duplicates"] += 1
        if record.get("anomaly_flag") in (-1, "-1") or _is_true(record.get("is_anomaly")):
            counts["outliers"] += 1
        detections = record.get("pii_detections")
        flagged = record.get("pii_flagged") is True or str(record.get("pii_flagged")).lower() in ("true", "1")
        if flagged or (isinstance(detections, list) and any(isinstance(item, dict) for item in detections)):
            counts["pii_phi"] += 1

    category_points = {
        key: Decimal(20) * (Decimal(1) - Decimal(count) / Decimal(total)) if total else Decimal(0)
        for key, count in counts.items()
    }
    quality = sum(category_points.values(), Decimal(0)).quantize(Decimal("0.1"), rounding=ROUND_HALF_UP)
    return {
        "record_count": total,
        "quality_score": float(quality),
        "flag_count": sum(counts.values()),
        "pending_npi_count": pending_npis,
        "score_categories": {
            key: {
                "points": float(points.quantize(Decimal("0.1"), rounding=ROUND_HALF_UP)),
                "max_points": 20,
                "issue_count": counts[key],
            }
            for key, points in category_points.items()
        },
    }