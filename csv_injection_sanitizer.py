"""Cell-level sanitization against spreadsheet/CSV injection attacks.

Untrusted string values pulled from uploaded CSV cells can carry three broad
attack classes before they ever reach Firestore:

1. Spreadsheet formula injection (aka CSV/DDE injection) — cells beginning
   with ``=``, ``+``, ``-``, ``@`` (or a leading tab/carriage return) are
   interpreted as executable formulas by Excel/LibreOffice/Google Sheets,
   e.g. ``=cmd|' /C calc.exe'!A1``.
2. Executable script injection — HTML/JS payloads such as
   ``<script>alert(1)</script>`` or ``javascript:`` URIs.
3. Malformed UTF-8 — invalid byte sequences or lone surrogate code points
   that cannot be round-tripped through UTF-8, which would otherwise raise
   when the Firestore client encodes the write.

``sanitize_cell_value``/``sanitize_record`` neutralize all three before a
record is persisted.
"""

from __future__ import annotations

import re
from typing import Any

# Leading characters that spreadsheet applications treat as formula triggers.
FORMULA_TRIGGER_CHARS = ("=", "+", "-", "@", "\t", "\r")

_SCRIPT_BLOCK_PATTERN = re.compile(r"<\s*script\b[^>]*>.*?<\s*/\s*script\s*>", re.IGNORECASE | re.DOTALL)
_STRAY_TAG_PATTERN = re.compile(r"</?\s*script\b[^>]*>", re.IGNORECASE)
_JAVASCRIPT_URI_PATTERN = re.compile(r"javascript\s*:", re.IGNORECASE)
_ON_EVENT_HANDLER_PATTERN = re.compile(r"\bon[a-z]+\s*=", re.IGNORECASE)


def sanitize_malformed_utf8(value: str | bytes) -> str:
    """Coerce ``value`` into a string that safely round-trips through UTF-8.

    Accepts raw bytes (decoded with invalid sequences replaced) or a ``str``
    that may still contain lone surrogate code points (e.g. produced via
    ``errors="surrogateescape"`` upstream); either way the result is
    guaranteed encodable as UTF-8.
    """
    if isinstance(value, bytes):
        return value.decode("utf-8", errors="replace")
    if isinstance(value, str):
        return value.encode("utf-8", errors="replace").decode("utf-8")
    return value


def sanitize_script_injection(value: str) -> str:
    """Strip executable script tags, event handlers, and javascript: URIs."""
    cleaned = _SCRIPT_BLOCK_PATTERN.sub("", value)
    cleaned = _STRAY_TAG_PATTERN.sub("", cleaned)
    cleaned = _JAVASCRIPT_URI_PATTERN.sub("", cleaned)
    cleaned = _ON_EVENT_HANDLER_PATTERN.sub("", cleaned)
    return cleaned


def sanitize_formula_injection(value: str) -> str:
    """Strip leading formula-trigger characters so the cell can't execute as a formula."""
    cleaned = value
    while cleaned and cleaned[0] in FORMULA_TRIGGER_CHARS:
        cleaned = cleaned[1:]
    return cleaned


def sanitize_cell_value(value: Any) -> Any:
    """Sanitize a single spreadsheet cell value before it is stored in Firestore.

    Non-string values (numbers, booleans, None) pass through untouched.
    """
    if isinstance(value, bytes):
        value = sanitize_malformed_utf8(value)
    if not isinstance(value, str):
        return value

    cleaned = sanitize_malformed_utf8(value)
    cleaned = sanitize_script_injection(cleaned)
    cleaned = sanitize_formula_injection(cleaned)
    return cleaned


def sanitize_record(record: dict[str, Any]) -> dict[str, Any]:
    """Return a copy of ``record`` with every value passed through ``sanitize_cell_value``."""
    return {key: sanitize_cell_value(value) for key, value in record.items()}


__all__ = [
    "FORMULA_TRIGGER_CHARS",
    "sanitize_cell_value",
    "sanitize_formula_injection",
    "sanitize_malformed_utf8",
    "sanitize_record",
]
