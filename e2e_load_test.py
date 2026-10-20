"""Load-test the local, 500-row provider-processing pipeline without credentials."""

from __future__ import annotations

import argparse
import csv
import os
import socket
import subprocess
import sys
import tempfile
import threading
import time
from pathlib import Path
from urllib.parse import quote
from uuid import uuid4

import psutil
import requests

MIB = 1024 * 1024
MINIMUM_FILE_SIZE = 50 * MIB
POLL_INTERVAL_SECONDS = 2.0


def _start_local_server() -> tuple[subprocess.Popen, str]:
    with socket.socket() as listener:
        listener.bind(("127.0.0.1", 0))
        port = listener.getsockname()[1]

    base_url = f"http://127.0.0.1:{port}"
    server_env = os.environ.copy()
    server_env["MEDREACH_E2E_LOCAL_MODE"] = "1"
    server_env["ENVIRONMENT"] = "development"
    server_process = subprocess.Popen(
        [
            sys.executable,
            "-m",
            "uvicorn",
            "main:app",
            "--host",
            "127.0.0.1",
            "--port",
            str(port),
            "--log-level",
            "warning",
        ],
        cwd=Path(__file__).resolve().parent,
        env=server_env,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.STDOUT,
    )

    for _ in range(60):
        if server_process.poll() is not None:
            raise RuntimeError("The local FastAPI test server exited during startup.")
        try:
            response = requests.get(f"{base_url}/openapi.json", timeout=1)
            if response.ok:
                return server_process, base_url
        except requests.RequestException:
            pass
        time.sleep(0.5)

    server_process.terminate()
    server_process.wait(timeout=10)
    raise TimeoutError("The local FastAPI test server did not become ready.")


def generate_synthetic_csv(
    path: Path, minimum_size: int = MINIMUM_FILE_SIZE
) -> tuple[int, int]:
    """Write synthetic provider rows until the CSV is at least 50 MiB."""
    row_count = 0
    with path.open("w", newline="", encoding="utf-8", buffering=MIB) as csv_file:
        writer = csv.writer(csv_file)
        writer.writerow(["NPI", "First Name", "Last Name", "Taxonomy Code"])

        while True:
            npi = f"{9000000000 + row_count:010d}"
            writer.writerow(
                [
                    npi,
                    f"SyntheticFirst{row_count:08d}",
                    f"LoadTestProvider{row_count:08d}",
                    "207Q00000X",
                ]
            )
            row_count += 1
            if row_count % 10000 == 0:
                csv_file.flush()
                if csv_file.tell() >= minimum_size:
                    break

    return row_count, path.stat().st_size


class ServerMemoryMonitor:
    def __init__(self, server_pid: int, interval_seconds: float = 1.0) -> None:
        self.process = psutil.Process(server_pid)
        self.interval_seconds = interval_seconds
        self.peak_rss_mib = 0.0
        self.samples = 0
        self.process_exited = False
        self._stop = threading.Event()
        self._thread = threading.Thread(
            target=self._run, name="server-rss-monitor", daemon=True
        )

    def _sample(self) -> None:
        try:
            rss_mib = self.process.memory_info().rss / MIB
        except psutil.NoSuchProcess:
            self.process_exited = True
            print("server_process=exited", flush=True)
            self._stop.set()
            return

        self.peak_rss_mib = max(self.peak_rss_mib, rss_mib)
        self.samples += 1
        print(
            f"server_rss_mib={rss_mib:.1f} peak_mib={self.peak_rss_mib:.1f}", flush=True
        )

    def _run(self) -> None:
        while not self._stop.wait(self.interval_seconds):
            self._sample()

    def start(self) -> None:
        if not self.process.is_running():
            raise RuntimeError(
                f"No running server process found for PID {self.process.pid}."
            )
        self._sample()
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()
        if self._thread.is_alive():
            self._thread.join(timeout=self.interval_seconds + 1)


def _response_json(response: requests.Response, operation: str) -> dict:
    if not response.ok:
        raise RuntimeError(
            f"{operation} failed with HTTP {response.status_code}: "
            f"{response.text[:500]}"
        )
    payload = response.json()
    if not isinstance(payload, dict):
        raise RuntimeError(
            f"{operation} returned an unexpected " "response body."
        )
    return payload


def run_load_test(args: argparse.Namespace) -> dict:
    server_process, base_url = _start_local_server()
    session = requests.Session()
    company_id = quote(args.company_id, safe="")
    filename = f"e2e_provider_load_{uuid4().hex}.csv"
    monitor = ServerMemoryMonitor(server_process.pid)

    try:
        monitor.start()
        with tempfile.TemporaryDirectory(prefix="medreach-e2e-") as temp_dir:
            csv_path = Path(temp_dir) / filename
            row_count, file_size = generate_synthetic_csv(
                csv_path, args.minimum_size_mib * MIB
            )
            print(
                f"generated_rows={row_count} file_size_mib={file_size / MIB:.2f}",
                flush=True,
            )

            signed_response = session.post(
                f"{base_url}/api/upload/generate-url",
                json={"filename": filename, "content_type": "text/csv"},
                timeout=30,
            )
            signed_payload = _response_json(signed_response, "Signed URL request")
            signed_url = signed_payload.get("signed_url")
            object_name = signed_payload.get("object_name")
            if not signed_url or not object_name:
                raise RuntimeError(
                    "Signed URL response is missing signed_url or object_name."
                )

            with csv_path.open("rb") as csv_file:
                upload_response = requests.put(
                    signed_url,
                    data=csv_file,
                    headers={"Content-Type": "text/csv"},
                    timeout=(20, 900),
                )
            if not upload_response.ok:
                raise RuntimeError(
                    "Local streamed upload failed with "
                    f"HTTP {upload_response.status_code}."
                )

            process_response = session.post(
                f"{base_url}/api/companies/{company_id}/uploads/process",
                json={
                    "object_name": object_name,
                    "skip_npi_validation": True,
                    "skip_content_analysis": True,
                    "delete_source_on_success": True,
                },
                timeout=30,
            )
            job = _response_json(process_response, "Processing job request")
            job_id = job.get("job_id")
            if process_response.status_code != 202 or not job_id:
                raise RuntimeError(
                    "Processing endpoint did not return an accepted job ID."
                )

            status_url = (
                f"{base_url}/api/companies/{company_id}/uploads/process/"
                f"{quote(job_id, safe='')}"
            )
            deadline = time.monotonic() + args.timeout_seconds
            while time.monotonic() < deadline:
                status_response = session.get(status_url, timeout=30)
                job = _response_json(status_response, "Processing status request")
                print(
                    "job_status={status} records={records} batches={batches}".format(
                        status=job.get("status"),
                        records=job.get("records_processed", 0),
                        batches=job.get("completed_batches", 0),
                    ),
                    flush=True,
                )
                if job.get("status") == "completed":
                    break
                if job.get("status") == "failed":
                    raise RuntimeError(job.get("error", "Processing job failed."))
                time.sleep(args.poll_interval_seconds)
            else:
                raise TimeoutError(
                    f"Processing job {job_id} did not complete before the timeout."
                )
    finally:
        monitor.stop()
        if server_process.poll() is None:
            server_process.terminate()
            try:
                server_process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                server_process.kill()
                server_process.wait(timeout=10)

    if monitor.process_exited:
        raise RuntimeError("The FastAPI worker exited during the load test.")
    if job.get("records_processed") != row_count:
        raise AssertionError(
            f"Expected {row_count} processed rows, got {job.get('records_processed')}."
        )
    if job.get("batch_size") != 500 or job.get("max_batch_records", 0) > 500:
        raise AssertionError(f"Observed processing batch larger than 500 rows: {job}.")
    if args.max_rss_mib is not None and monitor.peak_rss_mib > args.max_rss_mib:
        raise AssertionError(
            f"Peak server RSS {monitor.peak_rss_mib:.1f} MiB exceeded "
            f"the configured limit {args.max_rss_mib:.1f} MiB."
        )

    result = {
        "job_id": job["job_id"],
        "rows": row_count,
        "file_size_mib": round(file_size / MIB, 2),
        "batches": job["completed_batches"],
        "max_batch_records": job["max_batch_records"],
        "server_peak_rss_mib": round(monitor.peak_rss_mib, 1),
        "memory_samples": monitor.samples,
    }
    print(f"load_test_passed={result}", flush=True)
    return result


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--company-id",
        default=os.environ.get("MEDREACH_COMPANY_ID", "load-test-company"),
    )
    parser.add_argument("--minimum-size-mib", type=int, default=50)
    parser.add_argument("--timeout-seconds", type=int, default=1800)
    parser.add_argument(
        "--poll-interval-seconds", type=float, default=POLL_INTERVAL_SECONDS
    )
    parser.add_argument(
        "--max-rss-mib", type=float, default=os.environ.get("MEDREACH_MAX_RSS_MIB")
    )
    args = parser.parse_args()
    run_load_test(args)


if __name__ == "__main__":
    main()
