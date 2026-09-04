import pandas as pd
import pytest

from anomaly_explanation_service import generate_anomaly_explanations


@pytest.fixture
def providers_df() -> pd.DataFrame:
    return pd.DataFrame(
        [
            # Cardiology: one peer + one flagged outlier (5.2x the peer average).
            {"specialty": "Cardiology", "billing_volume": 100, "anomaly_flag": 1},
            {"specialty": "Cardiology", "billing_volume": 520, "anomaly_flag": -1},
            # Neurology: a lone flagged record with no peers in its group.
            {"specialty": "Neurology", "billing_volume": 999, "anomaly_flag": -1},
            # Oncology: peers with a zero average + a flagged outlier.
            {"specialty": "Oncology", "billing_volume": 0, "anomaly_flag": 1},
            {"specialty": "Oncology", "billing_volume": 0, "anomaly_flag": 1},
            {"specialty": "Oncology", "billing_volume": 75, "anomaly_flag": -1},
        ]
    )


def test_flagged_record_gets_explanation_with_accurate_multiplier(providers_df):
    result = generate_anomaly_explanations(providers_df, feature_cols=["billing_volume"])

    cardiology_anomaly = result[(result["specialty"] == "Cardiology") & (result["anomaly_flag"] == -1)].iloc[0]

    assert cardiology_anomaly["anomaly_explanation"] == "billing_volume is 5.2x above the Cardiology average"


def test_normal_records_receive_no_explanation(providers_df):
    result = generate_anomaly_explanations(providers_df, feature_cols=["billing_volume"])

    normal_records = result[result["anomaly_flag"] == 1]

    assert normal_records["anomaly_explanation"].isna().all()


def test_group_with_no_peers_does_not_crash_and_provides_fallback_text(providers_df):
    result = generate_anomaly_explanations(providers_df, feature_cols=["billing_volume"])

    neurology_anomaly = result[result["specialty"] == "Neurology"].iloc[0]

    assert neurology_anomaly["anomaly_explanation"] is not None
    assert "no peer records" in neurology_anomaly["anomaly_explanation"]


def test_zero_group_average_does_not_raise_division_by_zero(providers_df):
    result = generate_anomaly_explanations(providers_df, feature_cols=["billing_volume"])

    oncology_anomaly = result[(result["specialty"] == "Oncology") & (result["anomaly_flag"] == -1)].iloc[0]

    assert oncology_anomaly["anomaly_explanation"] is not None
    assert "average of 0" in oncology_anomaly["anomaly_explanation"]


def test_multiple_feature_cols_are_joined_in_explanation():
    df = pd.DataFrame(
        [
            {"specialty": "Radiology", "billing_volume": 100, "visit_count": 10, "anomaly_flag": 1},
            {"specialty": "Radiology", "billing_volume": 300, "visit_count": 50, "anomaly_flag": -1},
        ]
    )

    result = generate_anomaly_explanations(df, feature_cols=["billing_volume", "visit_count"])

    anomaly_row = result[result["anomaly_flag"] == -1].iloc[0]
    assert "billing_volume is 3.0x above the Radiology average" in anomaly_row["anomaly_explanation"]
    assert "visit_count is 5.0x above the Radiology average" in anomaly_row["anomaly_explanation"]
