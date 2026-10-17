import asyncio
import io
from unittest.mock import patch

import httpx

import main as main_module
from main import app
from scrubbing_pipeline import stream_scrubbed_gcs_csv


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


def test_gcs_stream_uses_500_row_batches_without_external_npi_validation():
    csv_payload = (
        "NPI,First Name,Last Name,Taxonomy Code\n"
        + "".join(
            f"{9000000000 + index},Demo,Provider{index:07d},207Q00000X\n"
            for index in range(1201)
        )
    )
    batch_sizes = []

    class DummyBlob:
        def open(self, mode, chunk_size):
            return io.BytesIO(csv_payload.encode("utf-8"))

    class DummyBucket:
        def blob(self, object_name):
            return DummyBlob()

    class DummyStorageClient:
        def bucket(self, bucket_name):
            return DummyBucket()

    def local_scrub(records):
        batch_sizes.append(len(records))
        return records

    async def consume_batches():
        return [
            batch
            async for batch in stream_scrubbed_gcs_csv(
                "raw_uploads/test/providers.csv",
                validate_npi=False,
            )
        ]

    with patch("scrubbing_pipeline.storage.Client", return_value=DummyStorageClient()):
        with patch("scrubbing_pipeline._run_local_scrubbing", new=local_scrub):
            with patch(
                "scrubbing_pipeline.scrub_provider_records",
                side_effect=AssertionError("NPI registry validation should be skipped"),
            ):
                batches = asyncio.run(consume_batches())

    assert batch_sizes == [500, 500, 201]
    assert [len(batch) for batch in batches] == [500, 500, 201]


def test_authenticated_gcs_processing_jobs_are_owner_scoped():
    from unittest.mock import AsyncMock

    class FakeJobReference:
        def __init__(self):
            self.data = None

        def set(self, data, **kwargs):
            self.data = dict(data)

        def update(self, data, **kwargs):
            self.data.update(data)

        def get(self):
            class Snapshot:
                exists = self.data is not None

                def to_dict(snapshot_self):
                    return dict(self.data) if self.data is not None else None

            return Snapshot()

    class FakeCollection:
        def __init__(self):
            self.references = {}

        def document(self, job_id):
            return self.references.setdefault(job_id, FakeJobReference())

    class FakeDatabase:
        def __init__(self):
            self.jobs = FakeCollection()

        def collection(self, name):
            assert name == "processing_jobs"
            return self.jobs

    class FakeBlob:
        def generate_signed_url(self, **kwargs):
            return "https://storage.example.test/signed"

    class FakeBucket:
        def blob(self, object_name):
            return FakeBlob()

    class FakeStorageClient:
        def bucket(self, bucket_name):
            assert bucket_name == "medreach-ai-uploads"
            return FakeBucket()

    async def exercise_routes():
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
            unauthenticated = await client.post(
                "/api/uploads/generate-signed-url",
                json={"filename": "providers.csv"},
            )
            assert unauthenticated.status_code == 401

            app.dependency_overrides[main_module.require_authenticated_editor] = lambda: {
                "uid": "load-test-user",
                "role": "admin",
            }
            with patch("main.db", new=FakeDatabase()) as fake_db:
                with patch("main.gcs_storage.Client", return_value=FakeStorageClient()):
                    with patch("main._process_uploaded_csv_job", new=AsyncMock()):
                        signed = await client.post(
                            "/api/uploads/generate-signed-url",
                            json={"filename": "providers.csv"},
                        )
                        assert signed.status_code == 200, signed.text
                        object_name = signed.json()["object_name"]
                        assert object_name.startswith("raw_uploads/load-test-user/")

                        queued = await client.post(
                            "/api/companies/load-test-company/uploads/process",
                            json={
                                "object_name": object_name,
                                "skip_npi_validation": True,
                                "delete_source_on_success": True,
                            },
                        )
                        assert queued.status_code == 202, queued.text
                        job_id = queued.json()["job_id"]

                        status = await client.get(
                            f"/api/companies/load-test-company/uploads/process/{job_id}"
                        )
                        assert status.status_code == 200, status.text
                        assert status.json()["batch_size"] == 500
                        assert status.json()["status"] == "queued"

                        app.dependency_overrides[main_module.require_authenticated_editor] = lambda: {
                            "uid": "another-user",
                            "role": "admin",
                        }
                        hidden_status = await client.get(
                            f"/api/companies/load-test-company/uploads/process/{job_id}"
                        )
                        assert hidden_status.status_code == 404

                        app.dependency_overrides[main_module.require_authenticated_editor] = lambda: {
                            "uid": "load-test-user",
                            "role": "editor",
                        }
                        denied_bypass = await client.post(
                            "/api/companies/load-test-company/uploads/process",
                            json={
                                "object_name": object_name,
                                "skip_npi_validation": True,
                            },
                        )
                        assert denied_bypass.status_code == 403

    dependency_key = main_module.require_authenticated_editor
    previous_override = app.dependency_overrides.get(dependency_key)
    try:
        asyncio.run(exercise_routes())
    finally:
        if previous_override is None:
            app.dependency_overrides.pop(dependency_key, None)
        else:
            app.dependency_overrides[dependency_key] = previous_override


def test_background_processing_job_tracks_streamed_batch_totals():
    class FakeJobReference:
        def __init__(self):
            self.data = {}

        def update(self, updates, **kwargs):
            self.data.update(updates)

    class FakeCollection:
        def __init__(self, reference):
            self.reference = reference

        def document(self, job_id):
            assert job_id == "job-123"
            return self.reference

    class FakeDatabase:
        def __init__(self, reference):
            self.reference = reference

        def collection(self, name):
            assert name == "processing_jobs"
            return FakeCollection(self.reference)

    reference = FakeJobReference()

    async def fake_stream(object_name, **kwargs):
        assert object_name == "raw_uploads/test-user/providers.csv"
        assert kwargs["batch_size"] == 500
        assert kwargs["validate_npi"] is False
        yield [{"record": index} for index in range(500)]
        yield [{"record": index} for index in range(37)]

    async def run_job():
        with patch("main.db", new=FakeDatabase(reference)):
            with patch("main.stream_scrubbed_gcs_csv", new=fake_stream):
                await main_module._process_uploaded_csv_job(
                    "job-123",
                    "raw_uploads/test-user/providers.csv",
                    skip_npi_validation=True,
                    delete_source_on_success=False,
                )

    asyncio.run(run_job())

    assert reference.data["status"] == "completed"
    assert reference.data["completed_batches"] == 2
    assert reference.data["records_processed"] == 537
    assert reference.data["max_batch_records"] == 500


def test_local_generate_upload_url_skips_gcs_signing_and_accepts_put():
    assert main_module.USE_EMULATOR, "This test assumes emulator/dev mode (no real GCS credentials)."

    async def exercise():
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
            url_response = await client.post(
                "/api/upload/generate-url",
                json={"company_id": "demo-company", "filename": "providers.csv", "content_type": "text/csv"},
                headers={"X-User-Role": "editor"},
            )
            assert url_response.status_code == 200, url_response.text
            payload = url_response.json()
            assert payload["upload_url"].startswith("http://testserver/api/local-uploads/")

            put_response = await client.put(payload["upload_url"], content=b"npi,first_name\n1234567890,Jane\n")
            assert put_response.status_code == 200, put_response.text
            assert put_response.json()["uploaded_bytes"] > 0

    asyncio.run(exercise())