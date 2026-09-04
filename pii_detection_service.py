"""PII and PHI detection using Microsoft Presidio."""

from __future__ import annotations

from typing import Any

from presidio_analyzer import AnalyzerEngine, Pattern, PatternRecognizer, RecognizerRegistry
from presidio_analyzer.nlp_engine import SpacyNlpEngine


MRN_PATTERN = Pattern(
    name="medical_record_number",
    regex=r"\bMRN[-:#\s]*[A-Z]{0,3}[-\s]?\d{6,10}\b",
    score=0.85,
)
SSN_FALLBACK_PATTERN = Pattern(
    name="us_social_security_number",
    regex=r"\b\d{3}[- .]\d{2}[- .]\d{4}\b",
    score=0.8,
)


def _build_analyzer() -> AnalyzerEngine:
    registry = RecognizerRegistry()
    registry.load_predefined_recognizers()
    registry.add_recognizer(
        PatternRecognizer(
            supported_entity="MEDICAL_RECORD_NUMBER",
            name="Medical Record Number Recognizer",
            patterns=[MRN_PATTERN],
            supported_language="en",
        )
    )
    registry.add_recognizer(
        PatternRecognizer(
            supported_entity="US_SSN",
            name="US SSN Pattern Fallback",
            patterns=[SSN_FALLBACK_PATTERN],
            supported_language="en",
        )
    )
    nlp_engine = SpacyNlpEngine(
        models=[{"lang_code": "en", "model_name": "en_core_web_sm"}]
    )
    return AnalyzerEngine(
        registry=registry,
        nlp_engine=nlp_engine,
        supported_languages=["en"],
    )


analyzer = _build_analyzer()


def scan_text_for_pii(text: str) -> list[dict[str, Any]]:
    """Return detected PII/PHI entities with exclusive character end offsets."""
    if not isinstance(text, str):
        raise TypeError("text must be a string")
    if not text:
        return []

    results = analyzer.analyze(
        text=text,
        language="en",
        entities=[
            "US_SSN",
            "CREDIT_CARD",
            "EMAIL_ADDRESS",
            "PHONE_NUMBER",
            "PERSON",
            "MEDICAL_RECORD_NUMBER",
        ],
        score_threshold=0.35,
    )
    return [
        {
            "entity_type": result.entity_type,
            "start": result.start,
            "end": result.end,
            "score": result.score,
        }
        for result in sorted(results, key=lambda item: (item.start, item.end))
    ]


__all__ = ["MRN_PATTERN", "analyzer", "scan_text_for_pii"]
