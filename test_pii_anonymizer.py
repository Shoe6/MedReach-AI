from pii_anonymization_service import anonymize_healthcare_text
from pii_detection_service import scan_text_for_pii


def test_anonymize_healthcare_text_replaces_detected_pii_with_entity_tags() -> None:
    text = (
        "Patient John Doe, SSN 123-45-6789, email john.doe@example.com, "
        "MRN: ABC-123456."
    )

    analyzer_results = scan_text_for_pii(text)
    anonymized = anonymize_healthcare_text(text, analyzer_results)

    assert "John Doe" not in anonymized
    assert "123-45-6789" not in anonymized
    assert "john.doe@example.com" not in anonymized
    assert "MRN: ABC-123456" not in anonymized
    assert "<REDACTED_PERSON>" in anonymized
    assert "<REDACTED_US_SSN>" in anonymized
    assert "<REDACTED_EMAIL_ADDRESS>" in anonymized
    assert "<REDACTED_MEDICAL_RECORD_NUMBER>" in anonymized


def test_anonymize_without_detections_preserves_text() -> None:
    text = "No sensitive information is present."

    assert anonymize_healthcare_text(text, []) == text
