"""Standalone demo: IsolationForest anomaly detection + regex PII redaction."""

import re

import pandas as pd
from sklearn.ensemble import IsolationForest

EMAIL_PATTERN = re.compile(r"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}")


def redact_pii(text: str) -> str:
    """Replace any email address found in text with <REDACTED>."""
    if not isinstance(text, str):
        return text
    return EMAIL_PATTERN.sub("<REDACTED>", text)


def build_sample_data() -> pd.DataFrame:
    return pd.DataFrame(
        {
            "provider_id": ["P001", "P002", "P003", "P004", "P005"],
            "provider_name": [
                "Dr. Alice Chen",
                "Dr. Brian Lee",
                "Dr. Carla Nguyen",
                "Dr. David Osei",
                "Dr. Elena Petrov",
            ],
            "contact_email": [
                "alice.chen@clinic.com",
                "brian.lee@medgroup.org",
                "carla.nguyen@healthcare.net",
                "david.osei@clinic.com",
                "elena.petrov@medgroup.org",
            ],
            "billed_amount": [1200.50, 980.00, 1105.75, 250000.00, 1150.25],
        }
    )


def main() -> None:
    print("=" * 60)
    print("STEP 1: Loading sample provider billing data")
    print("=" * 60)
    df = build_sample_data()
    print(df.to_string(index=False))

    print("\n" + "=" * 60)
    print("STEP 2: Running IsolationForest anomaly detection")
    print("=" * 60)
    model = IsolationForest(contamination=0.2, random_state=42)
    df["anomaly_flag"] = model.fit_predict(df[["billed_amount"]])
    print("Anomaly detection complete. Flags: -1 = anomaly, 1 = normal")
    anomalies = df[df["anomaly_flag"] == -1]
    print(f"Detected {len(anomalies)} anomalous record(s):")
    print(anomalies[["provider_id", "billed_amount", "anomaly_flag"]].to_string(index=False))

    print("\n" + "=" * 60)
    print("STEP 3: Redacting PII (contact emails)")
    print("=" * 60)
    df["contact_email"] = df["contact_email"].apply(redact_pii)
    print("PII redaction complete.")

    print("\n" + "=" * 60)
    print("FINAL PROCESSED DATAFRAME")
    print("=" * 60)
    print(df.to_string(index=False))


if __name__ == "__main__":
    main()
