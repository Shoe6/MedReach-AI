"""Generate a curated provider batch for the MedReachAI pipeline walkthrough."""

from __future__ import annotations

from pathlib import Path

import pandas as pd


OUTPUT_PATH = Path(__file__).with_name("curated_walkthrough_batch.csv")


def build_curated_providers() -> pd.DataFrame:
    """Build 11 normal provider records and four intentional pipeline test cases."""
    normal_records = [
        {
            "provider_id": f"normal-{index:02d}",
            "first_name": first_name,
            "last_name": last_name,
            "specialty": specialty,
            "npi": f"10000000{index:02d}",
            "npi_status": "Active",
            "billing_volume": 110 + index * 5,
            "prescription_volume": 180 + index * 10,
            "sunshine_act_transaction_total": 25.00 + index * 3,
            "payer_name": "Standard Health Partners",
            "nature_of_payment": "Food and Beverage",
        }
        for index, (first_name, last_name, specialty) in enumerate(
            [
                ("Ava", "Bennett", "Cardiology"),
                ("Noah", "Carter", "Internal Medicine"),
                ("Mia", "Davis", "Pediatrics"),
                ("Liam", "Evans", "Neurology"),
                ("Emma", "Flores", "Oncology"),
                ("Ethan", "Garcia", "Family Medicine"),
                ("Olivia", "Hughes", "Dermatology"),
                ("Lucas", "Irving", "Orthopedics"),
                ("Sophia", "Johnson", "Endocrinology"),
                ("Mason", "King", "Pulmonology"),
                ("Isabella", "Lopez", "Gastroenterology"),
            ],
            start=1,
        )
    ]

    anomaly_persona = {
        **normal_records[0],
        "provider_id": "persona-a-statistical-anomaly",
        "first_name": "Aria",
        "last_name": "Outlier",
        "prescription_volume": 10_000,
    }
    npi_failure_persona = {
        **normal_records[1],
        "provider_id": "persona-b-npi-failure",
        "first_name": "Blake",
        "last_name": "Deactivated",
        "npi": "DEACTIVATED-NPI",
        "npi_status": "Deactivated",
    }
    financial_conflict_persona = {
        **normal_records[2],
        "provider_id": "persona-c-financial-conflict",
        "first_name": "Casey",
        "last_name": "Conflict",
        "sunshine_act_transaction_total": 250.00,
        "payer_name": "Acme Pharmaceutical",
        "nature_of_payment": "Consulting Fee",
    }
    duplicate_persona = normal_records[3].copy()

    return pd.DataFrame(
        normal_records
        + [anomaly_persona, npi_failure_persona, financial_conflict_persona, duplicate_persona]
    )


def main() -> None:
    providers = build_curated_providers()
    providers.to_csv(OUTPUT_PATH, index=False)
    print(f"Wrote {len(providers)} records to {OUTPUT_PATH}")


if __name__ == "__main__":
    main()