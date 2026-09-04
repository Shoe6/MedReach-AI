from unittest.mock import MagicMock, patch

from fastapi.testclient import TestClient

from main import app


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
    (
        mocked_db.collection.return_value
        .document.return_value
        .collection.return_value
        .stream.return_value
    ) = mocked_uploads

    with patch("main.db", mocked_db):
        response = client.get("/api/companies/acme/dashboard_metrics")

    assert response.status_code == 200
    assert response.json() == {
        "company_id": "acme",
        "total_healthcare_professionals": 1500,
        "data_health_score": 85.0,
        "unresolved_validation_flags": 12,
    }
