"""MA-99 analytics aggregation and authenticated tenant isolation tests."""

from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient
from firebase_admin import auth as firebase_auth
from google.api_core.exceptions import ServiceUnavailable

import auth
import main
from analytics_dashboard import aggregate_analytics

pytestmark = pytest.mark.real_auth
client = TestClient(main.app)
HEADERS = {"Authorization": "Bearer analytics-test-token"}


def database(monkeypatch, records, failure=None):
    calls = []

    class Snapshot:
        def __init__(self, value):
            self.value = value

        def to_dict(self):
            return self.value

    class Records:
        def stream(self, **kwargs):
            assert kwargs == {"retry": None, "timeout": 3.0}
            if failure:
                raise failure
            return iter(Snapshot(record) for record in records)

    class Company:
        def collection(self, name):
            assert name == "records"
            return Records()

    class Companies:
        def document(self, company_id):
            calls.append(company_id)
            return Company()

    class Database:
        def collection(self, name):
            assert name == "companies"
            return Companies()

    monkeypatch.setattr(main, "db", Database())
    return calls


def authenticate(monkeypatch, **claims):
    monkeypatch.setattr(
        firebase_auth,
        "verify_id_token",
        lambda _: {
            "uid": "analytics-user",
            **claims,
        },
    )


def test_missing_token_returns_401():
    response = client.get("/api/analytics/dashboard", headers={"X-User-Role": "admin"})
    assert response.status_code == 401


def test_invalid_token_returns_401(monkeypatch):
    def invalid(_):
        raise firebase_auth.InvalidIdTokenError("invalid signature")

    monkeypatch.setattr(firebase_auth, "verify_id_token", invalid)
    assert client.get("/api/analytics/dashboard", headers=HEADERS).status_code == 401


@pytest.mark.parametrize("role", [None, "viewer", "editor", "admin", "super-admin"])
def test_endpoint_is_scoped_to_assigned_company_even_with_query_override(
    monkeypatch, role
):
    calls = database(
        monkeypatch,
        [
            {
                "NPI": "1234567890",
                "npi_status": "Active",
                "specialty": "Cardiology",
                "state": "ca",
                "merged_at": "2026-11-01T10:00:00Z",
            }
        ],
    )
    authenticate(monkeypatch, role=role, company_id="assigned-company")
    response = client.get(
        "/api/analytics/dashboard?company_id=other-company", headers=HEADERS
    )
    assert response.status_code == 200
    assert calls == ["assigned-company"]
    assert response.json() == {
        "company_id": "assigned-company",
        "total_records": 1,
        "undated_records": 0,
        "quality_trends": [
            {"date": "2026-11-01", "record_count": 1, "quality_score": 100.0}
        ],
        "specialty_distribution": [
            {"specialty": "Cardiology", "count": 1, "percentage": 100.0}
        ],
        "geographic_coverage": [{"state": "CA", "count": 1, "percentage": 100.0}],
    }


def test_company_falls_back_to_authenticated_user_document(monkeypatch):
    calls = database(monkeypatch, [])
    monkeypatch.setattr(
        auth,
        "get_user_document",
        lambda uid: (
            {
                "company_id": "profile-company",
            }
            if uid == "analytics-user"
            else pytest.fail("Unexpected user lookup")
        ),
    )
    authenticate(monkeypatch)
    response = client.get("/api/analytics/dashboard", headers=HEADERS)
    assert response.status_code == 200
    assert calls == ["profile-company"]
    assert response.json()["quality_trends"] == []
    assert response.json()["specialty_distribution"] == []
    assert response.json()["geographic_coverage"] == []


def test_missing_company_is_403_without_reading_company_data(monkeypatch):
    calls = database(monkeypatch, [])
    monkeypatch.setattr(auth, "get_user_document", lambda _: {})
    authenticate(monkeypatch)
    response = client.get("/api/analytics/dashboard", headers=HEADERS)
    assert response.status_code == 403
    assert calls == []


def test_firestore_failure_is_not_a_success_shaped_empty_response(monkeypatch):
    database(monkeypatch, [], failure=ServiceUnavailable("unavailable"))
    authenticate(monkeypatch, company_id="assigned-company")
    response = client.get("/api/analytics/dashboard", headers=HEADERS)
    assert response.status_code == 503
    assert "Unable to load analytics data" in response.json()["detail"]


def test_aggregation_normalizes_labels_scores_cohorts_and_tracks_undated_records():
    result = aggregate_analytics(
        [
            {
                "NPI": "1234567890",
                "npi_status": "Active",
                "specialty": "Cardiology",
                "state": "ca",
                "created_at": "2026-11-01T10:00:00Z",
            },
            {
                "NPI": "123",
                "specialty": " cardiology ",
                "State": "CA",
                "created_at": datetime(2026, 11, 1, tzinfo=timezone.utc),
            },
            {
                "NPI": "1234567891",
                "pri_spec": "Oncology",
                "state": "ny",
                "created_at": "bad-date",
                "uploadedAt": "2026-11-02T00:30:00+02:00",
            },
            {"NPI": "1234567892", "specialty": "", "state": None},
        ]
    )
    assert result["total_records"] == 4
    assert result["undated_records"] == 1
    assert result["quality_trends"] == [
        {
            "date": "2026-11-01",
            "record_count": 3,
            "quality_score": 93.3,
        }
    ]
    assert result["specialty_distribution"] == [
        {"specialty": "Cardiology", "count": 2, "percentage": 50.0},
        {"specialty": "Oncology", "count": 1, "percentage": 25.0},
        {"specialty": "Unknown", "count": 1, "percentage": 25.0},
    ]
    assert result["geographic_coverage"] == [
        {"state": "CA", "count": 2, "percentage": 50.0},
        {"state": "NY", "count": 1, "percentage": 25.0},
        {"state": "Unknown", "count": 1, "percentage": 25.0},
    ]


def test_trends_are_chronological_without_inventing_dates_for_undated_records():
    result = aggregate_analytics(
        [
            {"createdAt": "2026-11-03"},
            {"uploaded_at": "2026-11-01"},
            {"created_at": "not-a-date"},
            {},
        ]
    )
    assert [point["date"] for point in result["quality_trends"]] == [
        "2026-11-01",
        "2026-11-03",
    ]
    assert result["undated_records"] == 2
