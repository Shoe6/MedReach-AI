"""Generate a deterministic, intentionally messy NPPES/Open Payments registry extract."""

from __future__ import annotations

import random
from pathlib import Path

import pandas as pd


OUTPUT_PATH = Path(__file__).with_name("raw_registry_input.csv")
SEED = 62


def _messy_case(value: str, rng: random.Random) -> str:
    style = rng.randrange(4)
    if style == 0:
        return value.upper()
    if style == 1:
        return value.lower()
    if style == 2:
        return f" {value.lower()} "
    return value


def build_messy_registry_data() -> pd.DataFrame:
    rng = random.Random(SEED)
    specialties = ["Cardiology", "Neurology", "Pediatrics", "Oncology", "Family Medicine"]
    payment_types = ["Food and Beverage", "Consulting Fee", "Travel", "Education"]
    rows: list[dict[str, object]] = []

    for index in range(56):
        first_name = ["Avery", "Jordan", "Taylor", "Morgan", "Riley", "Casey"][index % 6]
        last_name = f"{['Bennett', 'Carter', 'Davis', 'Evans', 'Flores', 'Garcia'][index % 6]} {index + 1}"
        rows.append({
            "record_id": f"REG-{index + 1:04d}",
            "first_name": _messy_case(first_name, rng),
            "last_name": _messy_case(last_name, rng),
            "specialty": _messy_case(specialties[index % len(specialties)], rng),
            "npi": "" if index in {12, 41} else f"140000{index + 1:04d}",
            "email": f"{first_name.lower()}.{last_name.lower()}{index}@clinic.example",
            "phone": "" if index % 9 == 0 else f"555-010-{index + 1:04d}",
            "billing_volume": 90 + (index % 8) * 11,
            "prescription_volume": 160 + (index % 7) * 15,
            "payer_name": "" if index in {18, 47} else f"{['Northstar', 'Harbor', 'Cedar'][index % 3]} Pharma",
            "nature_of_payment": payment_types[index % len(payment_types)],
            "sunshine_act_transaction_total": round(24.0 + (index % 5) * 9.5, 2),
        })

    rows[7]["nature_of_payment"] = "Food and Bevrage"
    rows[23]["nature_of_payment"] = "Consultng Fee"
    rows[14]["billing_volume"] = 48_000
    rows[38]["prescription_volume"] = 75_000
    rows[52]["sunshine_act_transaction_total"] = 18_500.00

    for duplicate_set, source_index in enumerate((2, 16, 29, 44), start=1):
        original = rows[source_index].copy()
        original["record_id"] = f"DUP-{duplicate_set}-A"
        original["email"] = ""
        original["phone"] = f"555-019-{duplicate_set:04d}"
        rows.append(original)

    return pd.DataFrame(rows)


def main() -> None:
    data = build_messy_registry_data()
    data.to_csv(OUTPUT_PATH, index=False)
    print(f"Wrote {len(data)} records to {OUTPUT_PATH}")


if __name__ == "__main__":
    main()