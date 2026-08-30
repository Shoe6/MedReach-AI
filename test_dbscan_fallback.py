import numpy as np
import pandas as pd
import pytest

from dbscan_fallback_service import (
    DBSCAN_MODEL_NAME,
    ISOLATION_FOREST_MODEL_NAME,
    detect_anomalies_dynamic,
)

VARIANCE_THRESHOLD = 1.0


@pytest.fixture
def low_variance_df() -> pd.DataFrame:
    rng = np.random.default_rng(42)
    n = 60
    return pd.DataFrame(
        {
            "payment_amount": rng.normal(50.0, 0.1, n),
            "visit_count": rng.normal(20.0, 0.1, n),
        }
    )


@pytest.fixture
def high_variance_df() -> pd.DataFrame:
    rng = np.random.default_rng(42)
    n = 60
    return pd.DataFrame(
        {
            "payment_amount": rng.normal(50.0, 25.0, n),
            "visit_count": rng.normal(1000.0, 500.0, n),
        }
    )


def test_low_variance_dataset_routes_to_isolation_forest(low_variance_df):
    result = detect_anomalies_dynamic(low_variance_df, variance_threshold=VARIANCE_THRESHOLD)

    assert (result["detection_model_used"] == ISOLATION_FOREST_MODEL_NAME).all()
    assert set(result["anomaly_flag"].unique()).issubset({-1, 1})
    assert len(result) == len(low_variance_df)


def test_high_variance_dataset_routes_to_dbscan(high_variance_df):
    result = detect_anomalies_dynamic(high_variance_df, variance_threshold=VARIANCE_THRESHOLD)

    assert (result["detection_model_used"] == DBSCAN_MODEL_NAME).all()
    assert set(result["anomaly_flag"].unique()).issubset({-1, 1})
    assert len(result) == len(high_variance_df)


def test_dbscan_path_flags_at_least_one_outlier(high_variance_df):
    outlier_row = pd.DataFrame({"payment_amount": [1_000_000.0], "visit_count": [5_000_000.0]})
    df_with_outlier = pd.concat([high_variance_df, outlier_row], ignore_index=True)

    result = detect_anomalies_dynamic(
        df_with_outlier, variance_threshold=VARIANCE_THRESHOLD, eps=0.5, min_samples=5
    )

    assert result["detection_model_used"].iloc[-1] == DBSCAN_MODEL_NAME
    assert result["anomaly_flag"].iloc[-1] == -1


def test_appends_expected_columns_for_both_paths(low_variance_df, high_variance_df):
    low_result = detect_anomalies_dynamic(low_variance_df, variance_threshold=VARIANCE_THRESHOLD)
    high_result = detect_anomalies_dynamic(high_variance_df, variance_threshold=VARIANCE_THRESHOLD)

    for result, original in ((low_result, low_variance_df), (high_result, high_variance_df)):
        assert "anomaly_flag" in result.columns
        assert "detection_model_used" in result.columns
        for column in original.columns:
            assert column in result.columns


def test_rejects_non_dataframe_input():
    with pytest.raises(TypeError):
        detect_anomalies_dynamic([1, 2, 3], variance_threshold=VARIANCE_THRESHOLD)
