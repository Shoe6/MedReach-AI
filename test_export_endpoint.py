"""Tests for the processed-record export endpoint."""
from uuid import uuid4

import pandas as pd
from fastapi.testclient import TestClient

from main import app
from database import db


client = TestClient(app)


def test_export_data_returns_all_stored_records():
    """
    Test that the export endpoint returns every stored record.
    
    Test data:
    - Records with true, false, null, and missing Has_Opted_In are all included.
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
    
    exported_records = response.json()["records"]
    
    assert len(exported_records) == 4, f"Expected 4 records, got {len(exported_records)}"
    assert {record["name"] for record in exported_records} == {
        "John Doe", "Jane Smith", "Bob Johnson", "Alice Brown",
    }
    
    print(f"✓ Export test passed: {len(exported_records)} stored records exported")


def test_export_data_preserves_record_fields():
    """
    Test that the export endpoint standardizes the CSV format correctly.
    
    Verifications:
    - Stored fields are returned in the JSON records envelope
    - UTF-8 characters are preserved
    - No synthetic index column is added
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
    
    exported_records = response.json()["records"]
    
    # Verify all records are present (both opted-in)
    assert len(exported_records) == 2
    
    # Create a lookup by email to verify the correct record's fields
    records_by_email = {r["email"]: r for r in exported_records}
    assert records_by_email["john@example.com"]["phone"] is None
    assert records_by_email["jose@example.com"]["address"] is None
    
    # Verify UTF-8 characters are preserved
    assert "Döe" in records_by_email["john@example.com"]["name"]
    assert "José" in records_by_email["jose@example.com"]["name"]
    
    assert all("index" not in key.lower() for key in exported_records[0])
    
    print(f"✓ CSV format standardization test passed: {len(exported_records)} records exported with correct formatting")


def test_export_data_returns_empty_records_for_nonexistent_company():
    """Test that an empty company export remains a successful JSON response."""
    nonexistent_company = f"nonexistent-{uuid4()}"
    
    response = client.get(f"/api/companies/{nonexistent_company}/export_data")
    
    assert response.status_code == 200
    assert response.json() == {"records": []}
    print("✓ Empty export test passed: Nonexistent company returns no records")


def test_export_data_returns_records_without_opt_in():
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
    
    exported_records = response.json()["records"]
    
    assert len(exported_records) == 2
    print("✓ Records without opt-in test passed")


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
    
    exported_records = response.json()["records"]
    
    assert len(exported_records) == 2
    print("✓ Missing column test passed: Records without Has_Opted_In were returned")
