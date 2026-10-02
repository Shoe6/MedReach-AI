from unittest.mock import MagicMock, patch

from fastapi.testclient import TestClient

from main import app
from data_health_score_service import calculate_data_health


client = TestClient(app)


def test_dashboard_metrics_returns_mocked_aggregates() -> None:
    upload_documents = [
        {"metadata": {"record_count": 1000, "quality_score": 90, "flag_count": 5}},
        {"metadata": {"record_count": 500, "quality_score": 80, "flag_count": 7}},
    ]
    mocked_uploads = [
        MagicMock(to_dict=MagicMock(return_value=upload))
        for upload in upload_documents
    ]

    mocked_db = MagicMock()
    records_query = MagicMock()
    records_query.stream.return_value = []
    uploads_query = MagicMock()
    uploads_query.stream.return_value = mocked_uploads
    mocked_db.collection.return_value.document.return_value.collection.side_effect = (
        lambda name: records_query if name == "records" else uploads_query
    )

    with patch("main.db", mocked_db):
        response = client.get("/api/companies/acme/dashboard_metrics")

    assert response.status_code == 200
    assert response.json() == {
        "company_id": "acme",
        "total_healthcare_professionals": 1500,
        "data_health_score": 85.0,
        "unresolved_validation_flags": 12,
    }


def test_privacy_deductions_use_a_separate_twenty_point_bucket() -> None:
    records = [
        {"NPI": "1234567890", "npi_status": "Active", "pii_flagged": False, "pii_detections": [{"entity_type": "US_SSN"}, {"entity_type": "MEDICAL_RECORD_NUMBER"}]},
        {"NPI": "1234567891", "npi_status": "Active", "pii_flagged": "false"},
    ]
    scores = calculate_data_health(records)
    assert scores["quality_score"] == 90
    assert scores["flag_count"] == 1
    assert scores["score_categories"]["pii_phi"] == {"points": 10, "max_points": 20, "issue_count": 1}
    for key in ("npi_validation", "contact_completeness", "duplicates", "outliers"):
        assert scores["score_categories"][key]["points"] == 20


def test_all_five_categories_are_scored_independently() -> None:
    scores = calculate_data_health([
        {"NPI": "1234567890", "npi_status": "Active", "phone": "5551234567"},
        {"NPI": "1234567891", "npi_status": "Deactivated", "phone": "", "anomaly_flag": -1, "is_duplicate": True, "pii_flagged": "true"},
    ])
    assert scores["quality_score"] == 50
    assert scores["flag_count"] == 5
    assert all(category["points"] == 10 for category in scores["score_categories"].values())


def test_pending_npis_and_absent_contact_columns_do_not_create_errors() -> None:
    scores = calculate_data_health([{"NPI": "1234567890", "npi_status": "unvalidated_offline"}])
    assert scores["pending_npi_count"] == 1
    assert scores["quality_score"] == 100
    assert scores["flag_count"] == 0
    assert calculate_data_health([])["quality_score"] == 0


def test_dashboard_scores_processed_records_including_privacy() -> None:
    records = [
        {"NPI": "1234567890", "npi_status": "Active", "pii_flagged": True},
        {"NPI": "1234567891", "npi_status": "Active", "pii_flagged": "false"},
    ]
    mocked_db = MagicMock()
    mocked_db.collection.return_value.document.return_value.collection.return_value.stream.return_value = [
        MagicMock(to_dict=MagicMock(return_value=record)) for record in records
    ]
    with patch("main.db", mocked_db):
        response = client.get("/api/companies/acme/dashboard_metrics")
    assert response.status_code == 200
    assert response.json()["total_healthcare_professionals"] == 2
    assert response.json()["data_health_score"] == 90
    assert response.json()["score_categories"]["pii_phi"]["points"] == 10
