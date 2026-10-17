"""State-based prescriber privacy redaction engine (MA-48)."""
from typing import Any

# States with strict prescriber/provider privacy restrictions requiring contact info redaction.
RESTRICTED_STATES = {"CA", "NY", "TX", "IL"}

REDACTED_EMAIL = "***@***.com"
REDACTED_PHONE = "(***) ***-****"


def apply_state_privacy_mask(provider_record: dict) -> dict:
    """Redact email/phone on a provider record whose state is in RESTRICTED_STATES."""
    record = dict(provider_record)
    state = str(record.get("state") or record.get("practiceState") or "").strip().upper()

    if state in RESTRICTED_STATES:
        if "email" in record:
            record["email"] = REDACTED_EMAIL
        if "phone" in record:
            record["phone"] = REDACTED_PHONE

    return record


def process_provider_list(providers: list) -> list:
    """Apply the state privacy mask to every provider record in a list."""
    return [apply_state_privacy_mask(provider) for provider in providers]


# Example usage in a FastAPI route, right before returning JSON to the React frontend:
#
# from privacy_engine import process_provider_list
#
# @app.get("/api/providers")
# def get_providers():
#     providers = fetch_providers_from_db()
#     return process_provider_list(providers)
