"""Isolation Forest anomaly detection for mapped healthcare provider records."""

from __future__ import annotations

from typing import Any

import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import IsolationForest
from sklearn.impute import SimpleImputer
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder


class HealthcareAnomalyEngine:
    """Detect unusual provider records using a fitted Isolation Forest."""

    def __init__(self, contamination: float = 0.05, random_state: int = 42) -> None:
        self.contamination = contamination
        self.random_state = random_state
        self.model: Pipeline | None = None

    def _build_preprocessor(self, frame: pd.DataFrame) -> ColumnTransformer:
        numeric_columns = frame.select_dtypes(include=["number", "bool"]).columns.tolist()
        categorical_columns = [
            column for column in frame.columns if column not in numeric_columns
        ]

        transformers: list[tuple[str, Pipeline, list[str]]] = []
        if numeric_columns:
            transformers.append(
                (
                    "numeric",
                    Pipeline([("imputer", SimpleImputer(strategy="median"))]),
                    numeric_columns,
                )
            )
        if categorical_columns:
            transformers.append(
                (
                    "categorical",
                    Pipeline(
                        [
                            ("imputer", SimpleImputer(strategy="most_frequent")),
                            (
                                "encoder",
                                OneHotEncoder(handle_unknown="ignore", sparse_output=False),
                            ),
                        ]
                    ),
                    categorical_columns,
                )
            )

        if not transformers:
            raise ValueError("DataFrame must contain at least one feature column")

        return ColumnTransformer(transformers=transformers)

    def fit_predict(self, providers: pd.DataFrame) -> pd.DataFrame:
        """Return provider records with ``is_anomaly`` and ``anomaly_score`` columns."""
        if not isinstance(providers, pd.DataFrame):
            raise TypeError("providers must be a pandas DataFrame")

        result = providers.copy()
        if "is_anomaly" in result.columns or "anomaly_score" in result.columns:
            raise ValueError("Input DataFrame already contains anomaly output columns")

        if result.empty:
            result["is_anomaly"] = pd.Series(dtype=bool, index=result.index)
            result["anomaly_score"] = pd.Series(dtype=float, index=result.index)
            return result

        if len(result) < 2:
            result["is_anomaly"] = False
            result["anomaly_score"] = 0.0
            return result

        preprocessor = self._build_preprocessor(result)
        self.model = Pipeline(
            [
                ("preprocessor", preprocessor),
                (
                    "isolation_forest",
                    IsolationForest(
                        contamination=self.contamination,
                        random_state=self.random_state,
                    ),
                ),
            ]
        )
        predictions = self.model.fit_predict(result)
        decision_scores = self.model.decision_function(result)

        result["is_anomaly"] = (predictions == -1).astype(bool)
        result["anomaly_score"] = decision_scores.astype(float)
        return result


def detect_anomalies(
    providers: pd.DataFrame,
    *,
    contamination: float = 0.05,
    random_state: int = 42,
) -> pd.DataFrame:
    """Detect anomalies in a mapped provider DataFrame."""
    return HealthcareAnomalyEngine(
        contamination=contamination,
        random_state=random_state,
    ).fit_predict(providers)


__all__ = ["HealthcareAnomalyEngine", "detect_anomalies"]
