import asyncio
import io
from unittest.mock import patch

import httpx

from main import app


def test_upload_completes_with_local_scrubbing_when_npi_registry_is_offline():
    csv_payload = (
        "npi,first_name,last_name,email,claims_volume\n"
        "1234567890,John,Doe,john.doe@example.com,100\n"
        "1234567891,Jane,Smith,jane.smith@example.com,110\n"
    )

    async def timeout_get(self, url, params=None):
        raise httpx.TimeoutException("NPI registry unreachable")

    class DummyBlob:
        def upload_from_string(self, *args, **kwargs):
            return None

    class DummyBucket:
        def blob(self, *args, **kwargs):
            return DummyBlob()

    async def upload():
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
            with patch("main.storage.bucket", return_value=DummyBucket()):
                with patch("npi_registry_client.httpx.AsyncClient.get", new=timeout_get):
                    return await client.post(
                        "/api/companies/ma-57-offline/upload_file",
                        files={"file": ("providers.csv", io.BytesIO(csv_payload.encode()), "text/csv")},
                        headers={"X-User-Role": "editor"},
                    )

    response = asyncio.run(upload())
    assert response.status_code == 201, response.text

    records = response.json()["records"]
    assert len(records) == 2
    assert all(record["npi_status"] == "unvalidated_offline" for record in records)
    assert all(record["validation_status"] == "unvalidated_offline" for record in records)
    assert all(record["pii_flagged"] for record in records)
    assert all(record["pii_detections"] for record in records)
    assert all("anomaly_flag" in record for record in records)