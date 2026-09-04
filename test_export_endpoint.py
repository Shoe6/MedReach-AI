"""Tests for the CRM export endpoint - Jira ticket MA-18."""
import csv
import io
from uuid import uuid4

import pandas as pd
from fastapi.testclient import TestClient

from main import app
from database import db


client = TestClient(app)


def test_export_data_hipaa_compliance_filters_non_opted_in():
    """
    Test that the export endpoint filters out non-opted-in records (HIPAA compliance).
    
    Test data:
    - Record 1: Has_Opted_In = true (should be included)
    - Record 2: Has_Opted_In = false (should be excluded)
    - Record 3: Has_Opted_In = null (should be excluded)
    - Record 4: Has_Opted_In missing (should be excluded)
    """
    company_id = f"test-hipaa-compliance-{uuid4()}"
    
    # Create test data
    test_records = [
        {
            "id": "rec_001",
            "name": "John Doe",
            "email": "john@example.com",
            "npi": "1234567890",
            "Has_Opted_In": True,
        },
        {
            "id": "rec_002",
            "name": "Jane Smith",
            "email": "jane@example.com",
            "npi": "0987654321",
            "Has_Opted_In": False,  # Should be excluded
        },
        {
            "id": "rec_003",
            "name": "Bob Johnson",
            "email": "bob@example.com",
            "npi": "1111111111",
            "Has_Opted_In": None,  # Should be excluded
        },
        {
            "id": "rec_004",
            "name": "Alice Brown",
            "email": "alice@example.com",
            "npi": "2222222222",
            # Has_Opted_In missing - should be excluded
        },
    ]
    
    # Write test records to Firestore
    records_ref = db.collection("companies").document(company_id).collection("records")
    for record in test_records:
        records_ref.add(record)
    
    # Call the export endpoint
    response = client.get(f"/api/companies/{company_id}/export_data")
    
    # Verify response status
    assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
    
    # Verify headers
    assert "text/csv" in response.headers["content-type"]
    assert f"crm_export_{company_id}.csv" in response.headers["content-disposition"]
    
    # Parse the CSV response
    csv_text = response.text
    csv_reader = csv.DictReader(io.StringIO(csv_text))
    exported_records = list(csv_reader)
    
    # Verify only opted-in records are present
    assert len(exported_records) == 1, f"Expected 1 record, got {len(exported_records)}"
    assert exported_records[0]["name"] == "John Doe"
    assert exported_records[0]["email"] == "john@example.com"
    
    print(f"✓ HIPAA compliance test passed: {len(exported_records)} opted-in record exported")


def test_export_data_standardizes_csv_format():
    """
    Test that the export endpoint standardizes the CSV format correctly.
    
    Verifications:
    - NaN values are replaced with empty strings
    - UTF-8 encoding is used
    - Comma delimiter with proper quoting
    - No index column
    """
    company_id = f"test-csv-format-{uuid4()}"
    
    # Create test data with NaN values and special characters
    test_records = [
        {
            "id": "rec_001",
            "name": "John Döe",  # UTF-8 special character
            "email": "john@example.com",
            "phone": None,  # Should become empty string
            "address": "",  # Already empty
            "Has_Opted_In": True,
        },
        {
            "id": "rec_002",
            "name": "José María",  # UTF-8 accents
            "email": "jose@example.com",
            "phone": "555-1234",
            "address": None,  # Should become empty string
            "Has_Opted_In": True,
        },
    ]
    
    # Write test records to Firestore
    records_ref = db.collection("companies").document(company_id).collection("records")
    for record in test_records:
        records_ref.add(record)
    
    # Call the export endpoint
    response = client.get(f"/api/companies/{company_id}/export_data")
    
    # Verify response status
    assert response.status_code == 200
    
    # Parse the CSV response
    csv_text = response.text
    csv_reader = csv.DictReader(io.StringIO(csv_text))
    exported_records = list(csv_reader)
    
    # Verify all records are present (both opted-in)
    assert len(exported_records) == 2
    
    # Verify NaN values are replaced with empty strings (check both records)
    # Create a lookup by email to verify the correct record's fields
    records_by_email = {r["email"]: r for r in exported_records}
    assert records_by_email["john@example.com"]["phone"] == ""
    assert records_by_email["jose@example.com"]["address"] == ""
    
    # Verify UTF-8 characters are preserved
    assert "Döe" in records_by_email["john@example.com"]["name"]
    assert "José" in records_by_email["jose@example.com"]["name"]
    
    # Verify CSV structure (no index column)
    headers = list(exported_records[0].keys())
    assert all("index" not in h.lower() for h in headers)
    assert headers[0] in ["id", "name", "email", "phone", "address", "Has_Opted_In"]
    
    print(f"✓ CSV format standardization test passed: {len(exported_records)} records exported with correct formatting")


def test_export_data_returns_404_for_nonexistent_company():
    """Test that the export endpoint returns 404 for a nonexistent company."""
    nonexistent_company = f"nonexistent-{uuid4()}"
    
    response = client.get(f"/api/companies/{nonexistent_company}/export_data")
    
    assert response.status_code == 404
    print("✓ 404 test passed: Nonexistent company returns 404")


def test_export_data_empty_when_all_records_non_opted_in():
    """
    Test that the export endpoint handles the case where all records are non-opted-in.
    """
    company_id = f"test-all-non-opted-{uuid4()}"
    
    # Create test data where all records are non-opted-in
    test_records = [
        {
            "id": "rec_001",
            "name": "John Doe",
            "email": "john@example.com",
            "Has_Opted_In": False,
        },
        {
            "id": "rec_002",
            "name": "Jane Smith",
            "email": "jane@example.com",
            "Has_Opted_In": None,
        },
    ]
    
    # Write test records to Firestore
    records_ref = db.collection("companies").document(company_id).collection("records")
    for record in test_records:
        records_ref.add(record)
    
    # Call the export endpoint
    response = client.get(f"/api/companies/{company_id}/export_data")
    
    # Verify response status (200 with no records)
    # or 200 with empty CSV (just headers)
    assert response.status_code == 200
    
    # Parse the CSV response
    csv_text = response.text
    csv_reader = csv.DictReader(io.StringIO(csv_text))
    exported_records = list(csv_reader)
    
    # Verify no records are exported
    assert len(exported_records) == 0
    print("✓ Empty opt-in test passed: All non-opted-in records were filtered out")


def test_export_data_handles_missing_opted_in_column():
    """
    Test that the export endpoint safely handles data without Has_Opted_In column.
    """
    company_id = f"test-missing-column-{uuid4()}"
    
    # Create test data without Has_Opted_In column
    test_records = [
        {
            "id": "rec_001",
            "name": "John Doe",
            "email": "john@example.com",
        },
        {
            "id": "rec_002",
            "name": "Jane Smith",
            "email": "jane@example.com",
        },
    ]
    
    # Write test records to Firestore
    records_ref = db.collection("companies").document(company_id).collection("records")
    for record in test_records:
        records_ref.add(record)
    
    # Call the export endpoint
    response = client.get(f"/api/companies/{company_id}/export_data")
    
    # Verify response status (200 but with no records, as no one is explicitly opted-in)
    assert response.status_code == 200
    
    # Parse the CSV response
    csv_text = response.text
    csv_reader = csv.DictReader(io.StringIO(csv_text))
    exported_records = list(csv_reader)
    
    # Verify no records are exported (missing Has_Opted_In means not opted-in)
    assert len(exported_records) == 0
    print("✓ Missing column test passed: Records without Has_Opted_In were filtered out")
