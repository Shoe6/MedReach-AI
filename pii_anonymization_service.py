"""Healthcare PII and PHI anonymization using Microsoft Presidio."""

from __future__ import annotations

import re
from typing import Any

from presidio_analyzer import RecognizerResult
from presidio_anonymizer import AnonymizerEngine
from presidio_anonymizer.entities import OperatorConfig


_ENTITY_TYPE_PATTERN = re.compile(r"[^A-Za-z0-9_]+")
anonymizer = AnonymizerEngine()


def _recognizer_results(analyzer_results: list[dict[str, Any]]) -> list[RecognizerResult]:
    results = []
    for detection in analyzer_results:
        try:
            entity_type = str(detection["entity_type"])
            start = int(detection["start"])
            end = int(detection["end"])
            score = float(detection["score"])
        except (KeyError, TypeError, ValueError) as exc:
            raise ValueError(
                "Each analyzer result must contain entity_type, start, end, and score"
            ) from exc

        if start < 0 or end <= start:
            raise ValueError("Analyzer result spans must have 0 <= start < end")
        results.append(
            RecognizerResult(
                entity_type=entity_type,
                start=start,
                end=end,
                score=score,
            )
        )
    return results


def anonymize_healthcare_text(
    text: str, analyzer_results: list[dict[str, Any]]
) -> str:
    """Replace detected PII/PHI spans with entity-specific redaction tags."""
    if not isinstance(text, str):
        raise TypeError("text must be a string")
    if not isinstance(analyzer_results, list):
        raise TypeError("analyzer_results must be a list")
    if not analyzer_results:
        return text

    recognizer_results = _recognizer_results(analyzer_results)
    entity_types = {result.entity_type for result in recognizer_results}
    operators = {
        entity_type: OperatorConfig(
            "replace",
            {"new_value": f"<REDACTED_{_ENTITY_TYPE_PATTERN.sub('_', entity_type)}>"},
        )
        for entity_type in entity_types
    }
    return anonymizer.anonymize(
        text=text,
        analyzer_results=recognizer_results,
        operators=operators,
    ).text


__all__ = ["anonymize_healthcare_text", "anonymizer"]
