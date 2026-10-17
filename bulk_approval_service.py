"""Bulk approval of low-severity flags using Firestore batched writes (MA-XX).

Firestore caps each ``WriteBatch`` at 500 operations, so bulk approval jobs
are split into chunks of at most ``MAX_BATCH_SIZE`` documents and committed
one batch at a time.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Iterator

from google.cloud.firestore_v1.base_query import FieldFilter

MAX_BATCH_SIZE = 500


def _chunked(items: list[Any], size: int = MAX_BATCH_SIZE) -> Iterator[list[Any]]:
    for start in range(0, len(items), size):
        yield items[start : start + size]


def approve_documents_in_batches(db: Any, doc_refs: list[Any]) -> dict[str, int]:
    """Mark each Firestore document reference as approved/resolved.

    Splits ``doc_refs`` into chunks of at most ``MAX_BATCH_SIZE`` (Firestore's
    per-batch write limit) and commits one ``WriteBatch`` per chunk.
    """
    approved_at = datetime.now(timezone.utc).isoformat()
    approved_count = 0
    batch_count = 0

    for chunk in _chunked(doc_refs):
        if not chunk:
            continue
        batch = db.batch()
        for ref in chunk:
            batch.set(
                ref,
                {"resolved": True, "approved": True, "approved_at": approved_at},
                merge=True,
            )
        batch.commit()
        batch_count += 1
        approved_count += len(chunk)

    return {"approved_count": approved_count, "batch_count": batch_count}


def approve_low_severity_flags(
    db: Any,
    company_id: str,
    flag_ids: list[str] | None = None,
) -> dict[str, int]:
    """Bulk-approve Low-severity flags for a company via batched writes.

    If ``flag_ids`` is provided, only those specific flag documents are
    approved. Otherwise every unresolved flag with ``severity == "Low"``
    under ``companies/{company_id}/flags`` is queried and approved.
    """
    flags_ref = db.collection("companies").document(company_id).collection("flags")

    if flag_ids:
        doc_refs = [flags_ref.document(flag_id) for flag_id in flag_ids]
    else:
        query = flags_ref.where(filter=FieldFilter("severity", "==", "Low")).where(
            filter=FieldFilter("resolved", "==", False)
        )
        doc_refs = [doc.reference for doc in query.stream()]

    return approve_documents_in_batches(db, doc_refs)


__all__ = [
    "MAX_BATCH_SIZE",
    "approve_documents_in_batches",
    "approve_low_severity_flags",
]
