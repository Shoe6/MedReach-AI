"""Apply and verify the Cloud Storage CORS policy for the upload bucket."""

from __future__ import annotations

import json
from pathlib import Path

from google.api_core.exceptions import NotFound
from google.cloud import storage


BUCKET_NAME = "medreach-ai-uploads"
CONFIG_PATH = Path(__file__).with_name("gcs_cors.json")


def main() -> None:
    cors_policy = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
    client = storage.Client()
    try:
        bucket = client.get_bucket(BUCKET_NAME)
        print(f"Using existing bucket gs://{BUCKET_NAME}")
    except NotFound:
        bucket = client.bucket(BUCKET_NAME)
        client.create_bucket(bucket, project=client.project)
        print(f"Created bucket gs://{BUCKET_NAME} in project {client.project}")

    bucket.cors = cors_policy
    bucket.patch()

    bucket.reload()
    if bucket.cors != cors_policy:
        raise RuntimeError("Cloud Storage returned a CORS policy different from gcs_cors.json")

    print(f"Applied and verified CORS policy for gs://{BUCKET_NAME}")


if __name__ == "__main__":
    main()