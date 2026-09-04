import sqlite3

import pandas as pd
import pytest

from open_payments_ingestion import DEFAULT_TABLE_NAME, ensure_open_payments_table
from sunshine_flagging_service import THRESHOLD_USD, flag_sunshine_act_relationships


@pytest.fixture
def db_path(tmp_path):
    path = str(tmp_path / "open_payments.sqlite")
    conn = ensure_open_payments_table(db_path=path)

    rows = [
        # Over threshold: two payments from two companies, two relationship types.
        ("1111111111", 75.00, "Consulting Fee", "2024-01-15", "Acme Pharma"),
        ("1111111111", 50.00, "Travel", "2024-02-20", "Beta Biotech"),
        # Under threshold: single small payment.
        ("2222222222", 40.00, "Food and Beverage", "2024-03-01", "Gamma Labs"),
        # Exactly at threshold: should not be flagged (strictly greater than).
        ("3333333333", 100.00, "Gift", "2024-03-05", "Delta Pharma"),
    ]
    conn.executemany(
        f"INSERT INTO {DEFAULT_TABLE_NAME} (npi, total_amount, nature_of_payment, date_of_payment, payer_name) "
        "VALUES (?, ?, ?, ?, ?)",
        rows,
    )
    conn.commit()
    conn.close()
    return path


def test_provider_over_threshold_is_flagged_with_metadata(db_path):
    providers = [{"npi": "1111111111", "name": "Dr. Over Threshold"}]

    result = flag_sunshine_act_relationships(providers, db_path=db_path)[0]

    assert result["sunshine_act_flag"] is True
    metadata = result["sunshine_metadata"]
    assert metadata["total_amount_usd"] == pytest.approx(125.00)
    assert metadata["pharmaceutical_companies"] == ["Acme Pharma", "Beta Biotech"]
    assert metadata["relationship_types"] == ["Consulting Fee", "Travel"]


def test_provider_under_threshold_is_not_flagged(db_path):
    providers = [{"npi": "2222222222", "name": "Dr. Under Threshold"}]

    result = flag_sunshine_act_relationships(providers, db_path=db_path)[0]

    assert result["sunshine_act_flag"] is False
    assert "sunshine_metadata" not in result


def test_provider_exactly_at_threshold_is_not_flagged(db_path):
    providers = [{"npi": "3333333333", "name": "Dr. At Threshold"}]

    result = flag_sunshine_act_relationships(providers, db_path=db_path, threshold_usd=THRESHOLD_USD)[0]

    assert result["sunshine_act_flag"] is False
    assert "sunshine_metadata" not in result


def test_provider_with_no_records_is_not_flagged(db_path):
    providers = [{"npi": "9999999999", "name": "Dr. No Records"}]

    result = flag_sunshine_act_relationships(providers, db_path=db_path)[0]

    assert result["sunshine_act_flag"] is False
    assert "sunshine_metadata" not in result


def test_accepts_pandas_dataframe_input(db_path):
    df = pd.DataFrame([
        {"npi": "1111111111", "name": "Dr. Over Threshold"},
        {"npi": "2222222222", "name": "Dr. Under Threshold"},
    ])

    results = flag_sunshine_act_relationships(df, db_path=db_path)

    assert results[0]["sunshine_act_flag"] is True
    assert results[1]["sunshine_act_flag"] is False


def test_missing_npi_field_is_not_flagged(db_path):
    providers = [{"name": "Dr. No NPI"}]

    result = flag_sunshine_act_relationships(providers, db_path=db_path)[0]

    assert result["sunshine_act_flag"] is False
    assert "sunshine_metadata" not in result
