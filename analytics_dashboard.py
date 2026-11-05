"""Company-scoped analytics derived from stored, processed provider records."""

from collections import Counter, defaultdict
from datetime import date, datetime, timezone
from typing import Any

from data_health_score_service import calculate_data_health

DATE_FIELDS = (
    "merged_at",
    "processed_at",
    "created_at",
    "createdAt",
    "uploaded_at",
    "uploadedAt",
    "upload_date",
)
SPECIALTY_FIELDS = (
    "specialty",
    "pri_spec",
    "Specialty",
    "Primary Specialty",
    "Healthcare Provider Taxonomy Code_1",
)
STATE_FIELDS = (
    "state",
    "State",
    "state_code",
    "region",
    "Provider Business Practice Location Address State Name",
)


def _label(record: dict[str, Any], fields: tuple[str, ...]) -> str:
    for field in fields:
        value = record.get(field)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return "Unknown"


def _record_date(record: dict[str, Any]) -> str | None:
    for field in DATE_FIELDS:
        value = record.get(field)
        if isinstance(value, datetime):
            timestamp = value
        elif isinstance(value, date):
            return value.isoformat()
        elif isinstance(value, str) and value.strip():
            try:
                timestamp = datetime.fromisoformat(value.strip().replace("Z", "+00:00"))
            except ValueError:
                continue
        else:
            continue
        if timestamp.tzinfo is None:
            timestamp = timestamp.replace(tzinfo=timezone.utc)
        return timestamp.astimezone(timezone.utc).date().isoformat()
    return None


def aggregate_analytics(records: list[dict[str, Any]]) -> dict[str, Any]:
    """Score dated record cohorts, not reconstructed historical dataset snapshots."""
    specialties: Counter[str] = Counter()
    states: Counter[str] = Counter()
    specialty_labels: dict[str, str] = {}
    cohorts: dict[str, list[dict[str, Any]]] = defaultdict(list)
    undated = 0

    for record in records:
        specialty = _label(record, SPECIALTY_FIELDS)
        specialty_key = specialty.casefold()
        specialty_labels.setdefault(specialty_key, specialty)
        specialties[specialty_key] += 1
        state = _label(record, STATE_FIELDS)
        states[state.upper() if state != "Unknown" else state] += 1
        record_date = _record_date(record)
        if record_date is None:
            undated += 1
        else:
            cohorts[record_date].append(record)

    total = len(records)

    def distribution(
        counts: Counter[str],
        key: str,
        labels: dict[str, str] | None = None,
    ) -> list[dict[str, Any]]:
        return [
            {
                key: labels[label] if labels else label,
                "count": count,
                "percentage": round(count / total * 100, 2),
            }
            for label, count in sorted(
                counts.items(), key=lambda item: (-item[1], item[0])
            )
        ]

    return {
        "total_records": total,
        "undated_records": undated,
        "quality_trends": [
            {
                "date": day,
                "record_count": len(cohort),
                "quality_score": calculate_data_health(cohort)["quality_score"],
            }
            for day, cohort in sorted(cohorts.items())
        ],
        "specialty_distribution": distribution(
            specialties,
            "specialty",
            specialty_labels,
        ),
        "geographic_coverage": distribution(states, "state"),
    }
