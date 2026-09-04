"""Dynamic anomaly detection with a DBSCAN density-clustering fallback (MA-40).

Routes high-variance datasets to DBSCAN (better suited to density-based
outliers in noisy, spread-out data) and low-variance datasets to the existing
IsolationForest engine, for observability into which model handled a batch.
"""

from __future__ import annotations

import pandas as pd
from sklearn.cluster import DBSCAN
from sklearn.impute import SimpleImputer
from sklearn.preprocessing import StandardScaler

from ml_anomaly_engine import detect_anomalies as run_isolation_forest

DBSCAN_MODEL_NAME = "DBSCAN"
ISOLATION_FOREST_MODEL_NAME = "IsolationForest"


def _numeric_columns(df: pd.DataFrame) -> list[str]:
    return df.select_dtypes(include=["number"]).columns.tolist()


def _compute_variance_metric(df: pd.DataFrame, numeric_columns: list[str]) -> float:
    """Mean variance across numeric columns, used to decide the detection strategy."""
    if not numeric_columns:
        return 0.0
    variances = df[numeric_columns].var(numeric_only=True)
    if variances.empty:
        return 0.0
    mean_variance = variances.mean(skipna=True)
    return float(mean_variance) if pd.notna(mean_variance) else 0.0


def _run_dbscan(
    df: pd.DataFrame,
    numeric_columns: list[str],
    eps: float,
    min_samples: int,
) -> pd.DataFrame:
    result = df.copy()

    if not numeric_columns or result.empty:
        result["anomaly_flag"] = 1
        result["detection_model_used"] = DBSCAN_MODEL_NAME
        return result

    imputed = SimpleImputer(strategy="median").fit_transform(df[numeric_columns])
    scaled = StandardScaler().fit_transform(imputed)
    labels = DBSCAN(eps=eps, min_samples=min_samples).fit_predict(scaled)

    result["anomaly_flag"] = [-1 if label == -1 else 1 for label in labels]
    result["detection_model_used"] = DBSCAN_MODEL_NAME
    return result


def _run_isolation_forest(df: pd.DataFrame) -> pd.DataFrame:
    result = df.copy()

    if result.empty:
        result["anomaly_flag"] = pd.Series(dtype=int)
        result["detection_model_used"] = pd.Series(dtype=object)
        return result

    scored = run_isolation_forest(df)
    result["anomaly_flag"] = scored["is_anomaly"].map(lambda is_anomaly: -1 if is_anomaly else 1)
    result["detection_model_used"] = ISOLATION_FOREST_MODEL_NAME
    return result


def detect_anomalies_dynamic(
    df: pd.DataFrame,
    variance_threshold: float,
    eps: float = 0.5,
    min_samples: int = 5,
) -> pd.DataFrame:
    """Detect anomalies, routing to DBSCAN when numeric variance exceeds ``variance_threshold``.

    Appends ``anomaly_flag`` (-1 anomaly / 1 normal) and ``detection_model_used``
    ('DBSCAN' or 'IsolationForest') to a copy of ``df``.
    """
    if not isinstance(df, pd.DataFrame):
        raise TypeError("df must be a pandas DataFrame")

    numeric_columns = _numeric_columns(df)
    variance_metric = _compute_variance_metric(df, numeric_columns)

    if variance_metric > variance_threshold:
        return _run_dbscan(df, numeric_columns, eps, min_samples)
    return _run_isolation_forest(df)


__all__ = [
    "DBSCAN_MODEL_NAME",
    "ISOLATION_FOREST_MODEL_NAME",
    "detect_anomalies_dynamic",
]
