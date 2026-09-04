from pii_detection_service import scan_text_for_pii


def test_scan_text_returns_pii_types_and_exact_spans() -> None:
    text = (
        "Patient John Doe, SSN 123-45-6789, email john.doe@example.com, "
        "card 4111-1111-1111-1111, phone 415-555-2671, MRN: ABC-123456."
    )

    detections = scan_text_for_pii(text)
    by_type = {detection["entity_type"]: detection for detection in detections}

    assert {"US_SSN", "CREDIT_CARD", "EMAIL_ADDRESS", "PHONE_NUMBER", "PERSON", "MEDICAL_RECORD_NUMBER"} <= set(by_type)
    for detection in detections:
        assert text[detection["start"] : detection["end"]]
        assert detection["end"] > detection["start"]
        assert 0.0 <= detection["score"] <= 1.0

    assert text[by_type["US_SSN"]["start"] : by_type["US_SSN"]["end"]] == "123-45-6789"
    assert text[by_type["EMAIL_ADDRESS"]["start"] : by_type["EMAIL_ADDRESS"]["end"]] == "john.doe@example.com"
    assert text[by_type["MEDICAL_RECORD_NUMBER"]["start"] : by_type["MEDICAL_RECORD_NUMBER"]["end"]] == "MRN: ABC-123456"


def test_scan_empty_text_returns_empty_list() -> None:
    assert scan_text_for_pii("") == []
