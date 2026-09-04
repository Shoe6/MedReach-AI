import csv
import json
from pathlib import Path

import requests

SERVER_URL = "http://127.0.0.1:8000"
COMPANY_ID = "functional-test-clinic"


def create_valid_csv(path: Path, rows: int = 12000) -> None:
    with path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(["id", "name", "email", "status"])
        for i in range(rows):
            writer.writerow([i, f"user_{i}", f"user_{i}@example.com", "active"])


def create_corrupted_csv(path: Path) -> None:
    text = "id,name,email,status\n"
    text += "0,alpha,alpha@example.com,active\n"
    text += "1,beta,beta@example.com,active\n"
    text += "2,gamma,gamma@example.com,active\n"
    text += "3,delta,delta@example.com,active\n"
    text += "4,epsilon,epsilon@example.com,active\n"
    text += "5,zeta,zeta@example.com,active\n"
    text += '6,eta,"eta@example.com,active\n'
    path.write_text(text, encoding="utf-8")


def print_json(label: str, payload: object) -> None:
    print(f"{label}:\n{json.dumps(payload, indent=2, ensure_ascii=False)}")


if __name__ == "__main__":
    valid_path = Path("C:/temp/valid_pipeline.csv")
    corrupt_path = Path("C:/temp/corrupt_pipeline.csv")

    valid_path.parent.mkdir(parents=True, exist_ok=True)
    create_valid_csv(valid_path)

    with valid_path.open("rb") as valid_file:
        valid_response = requests.post(
            f"{SERVER_URL}/api/companies/{COMPANY_ID}/upload_file",
            files={"file": (valid_path.name, valid_file.read(), "text/csv")},
            timeout=180,
        )

    print(f"Happy path status code: {valid_response.status_code}")
    print_json("Happy path response", valid_response.json())

    create_corrupted_csv(corrupt_path)

    with corrupt_path.open("rb") as corrupt_file:
        corrupt_response = requests.post(
            f"{SERVER_URL}/api/companies/{COMPANY_ID}/upload_file",
            files={"file": (corrupt_path.name, corrupt_file.read(), "text/csv")},
            timeout=180,
        )

    print(f"\nMalformed path status code: {corrupt_response.status_code}")
    print_json("Malformed path response", corrupt_response.json())

    valid_path.unlink(missing_ok=True)
    corrupt_path.unlink(missing_ok=True)
