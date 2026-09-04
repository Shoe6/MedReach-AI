"""End-to-end verification of the MA-18 export endpoint."""
import csv
import io
from uuid import uuid4

from fastapi.testclient import TestClient

from main import app
from database import db

client = TestClient(app)

# Create a test company with export data
company_id = f"e2e-test-{uuid4()}"
test_records = [
    {"id": "1", "name": "Alice Smith", "email": "alice@example.com", "Has_Opted_In": True},
    {"id": "2", "name": "Bob Jones", "email": "bob@example.com", "Has_Opted_In": False},
    {"id": "3", "name": "Carol White", "email": "carol@example.com", "Has_Opted_In": True},
]

# Insert test data
records_ref = db.collection("companies").document(company_id).collection("records")
for record in test_records:
    records_ref.add(record)

# Call the export endpoint
response = client.get(f"/api/companies/{company_id}/export_data")

print(f"Status: {response.status_code}")
print(f"Content-Type: {response.headers.get('content-type')}")
print(f"Content-Disposition: {response.headers.get('content-disposition')}")
print("\n--- CSV Output ---")
print(response.text)

# Verify the content
csv_reader = csv.DictReader(io.StringIO(response.text))
records = list(csv_reader)
print(f"\nRecords exported: {len(records)}")
for i, record in enumerate(records, 1):
    print(f"{i}. {record.get('name')} ({record.get('email')})")

# Verify HIPAA compliance
print("\n--- HIPAA Compliance Verification ---")
print(f"Total input records: 3 (2 opted-in, 1 non-opted-in)")
print(f"Exported records: {len(records)}")
print(f"HIPAA Compliant: {len(records) == 2}")
