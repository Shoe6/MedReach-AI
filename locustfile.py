"""Locust load-testing suite for the MedReach AI upload + scrubbing pipeline.

Simulates concurrent editors each uploading a 50 MB provider CSV to
``POST /api/companies/{company_id}/upload_file``. That endpoint synchronously
runs the AI scrubbing pipeline for every request: chunked CSV ingestion,
healthcare heuristic column-type inference, and duplicate-cluster detection
(see ``ingestion.ingest_csv_chunks``).

Usage
-----
Start the API first::

    uvicorn main:app --host 0.0.0.0 --port 8000

Then run headless for 50 concurrent users, ramping up at 5 users/sec, for
5 minutes, with a CSV report written to disk::

    locust -f locustfile.py --host http://127.0.0.1:8000 \\
        --users 50 --spawn-rate 5 --run-time 5m --headless \\
        --csv=locust_report

Or launch the interactive web UI (defaults to http://localhost:8089)::

    locust -f locustfile.py --host http://127.0.0.1:8000

Pass criterion
--------------
>= 99% request success rate at 50-user concurrency, with the server process
staying within memory limits and uvicorn never crashing/restarting. The
``_check_success_rate`` listener below fails the Locust run (non-zero exit
code) automatically if the observed success rate drops below 99%, so CI
pipelines can gate on it directly.

The target upload size (default 50 MB) can be overridden for quick smoke
tests via the ``LOCUST_CSV_TARGET_BYTES`` environment variable.
"""

from __future__ import annotations

import io
import os
import uuid

from locust import HttpUser, between, events, task

TARGET_FILE_SIZE_BYTES = int(os.environ.get("LOCUST_CSV_TARGET_BYTES", 50 * 1024 * 1024))
SUCCESS_RATE_TARGET = 0.99

CSV_HEADER = "npi,first_name,last_name,email,phone,practice_state,specialty,has_opted_in\n"
SPECIALTIES = ["Cardiology", "Internal Medicine", "OB/GYN", "Orthopedics", "Neurology", "Oncology", "Dermatology"]
STATES = ["CA", "NY", "TX", "FL", "PA", "IL", "OH", "GA", "NC", "MI"]


def _build_csv_payload(target_bytes: int) -> bytes:
    """Generate a realistic healthcare-provider CSV padded out to ~target_bytes."""
    buffer = io.StringIO()
    buffer.write(CSV_HEADER)
    row_index = 0
    batch: list[str] = []
    batch_size = 2000

    while buffer.tell() < target_bytes:
        npi = f"{1000000000 + row_index:010d}"
        phone = f"555-{row_index % 900 + 100:03d}-{row_index % 9000 + 1000:04d}"
        state = STATES[row_index % len(STATES)]
        specialty = SPECIALTIES[row_index % len(SPECIALTIES)]
        opted_in = "true" if row_index % 3 else "false"
        batch.append(
            f"{npi},First{row_index},Last{row_index},"
            f"provider{row_index}@example-clinic.com,{phone},{state},{specialty},{opted_in}\n"
        )
        row_index += 1
        if len(batch) >= batch_size:
            buffer.write("".join(batch))
            batch.clear()

    if batch:
        buffer.write("".join(batch))

    return buffer.getvalue().encode("utf-8")


# Built once and shared (read-only) across every simulated user so the load
# generator itself doesn't need N x 50 MB of resident memory for payloads.
_CSV_PAYLOAD: bytes = _build_csv_payload(TARGET_FILE_SIZE_BYTES)
print(
    f"[locustfile] Prebuilt shared upload payload: "
    f"{len(_CSV_PAYLOAD) / (1024 * 1024):.2f} MB"
)


class ScrubbingPipelineUser(HttpUser):
    """An Editor who uploads a 50 MB CSV and runs it through the scrubbing pipeline."""

    wait_time = between(1, 3)

    def on_start(self) -> None:
        # Unique tenant per simulated user avoids cross-user interference.
        self.company_id = f"loadtest-{uuid.uuid4().hex[:12]}"

    @task
    def upload_and_scrub_csv(self) -> None:
        files = {"file": ("providers_50mb.csv", _CSV_PAYLOAD, "text/csv")}
        headers = {"X-User-Role": "editor"}

        with self.client.post(
            f"/api/companies/{self.company_id}/upload_file",
            files=files,
            headers=headers,
            timeout=180,
            name="/api/companies/[company_id]/upload_file",
            catch_response=True,
        ) as response:
            if response.status_code != 201:
                response.failure(f"Unexpected status {response.status_code}: {response.text[:300]}")
                return
            try:
                payload = response.json()
            except ValueError:
                response.failure("Response was not valid JSON")
                return
            if not payload.get("total_rows"):
                response.failure("Scrubbing pipeline returned zero processed rows")
                return
            response.success()


@events.quitting.add_listener
def _check_success_rate(environment, **kwargs):
    """Fail the run (non-zero exit code) if success rate drops below the 99% target."""
    stats = environment.runner.stats.total
    if stats.num_requests == 0:
        return

    success_rate = 1 - stats.fail_ratio
    print(
        f"[locustfile] Observed success rate: {success_rate:.2%} "
        f"over {stats.num_requests} requests ({stats.num_failures} failures)"
    )
    if success_rate < SUCCESS_RATE_TARGET:
        print(f"[locustfile] FAIL: success rate below the {SUCCESS_RATE_TARGET:.0%} target")
        environment.process_exit_code = 1
