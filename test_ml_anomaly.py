import pandas as pd

from ml_anomaly_engine import HealthcareAnomalyEngine, detect_anomalies


def test_isolation_forest_flags_obvious_provider_outlier() -> None:
    providers = pd.DataFrame(
        [
            {
                "practiceState": "CA",
                "specialty": "Cardiology",
                "claims_volume": 100 + (index % 4),
                "email_valid": True,
            }
            for index in range(19)
        ]
        + [
            {
                "practiceState": "WY",
                "specialty": "Rare Specialty",
                "claims_volume": 100000,
                "email_valid": False,
            }
        ]
    )

    result = detect_anomalies(providers)

    assert len(result) == 20
    assert result["is_anomaly"].dtype == bool
    assert result["anomaly_score"].dtype.kind == "f"
    assert bool(result.iloc[-1]["is_anomaly"]) is True
    assert result.iloc[-1]["anomaly_score"] < result.iloc[:-1]["anomaly_score"].min()


def test_engine_uses_required_contamination_and_fills_missing_values() -> None:
    providers = pd.DataFrame(
        {
            "practiceState": ["CA", None, "CA", "NY", "CA", "NY"],
            "specialty": ["Cardiology", "Cardiology", None, "Neurology", "Cardiology", "Neurology"],
            "claims_volume": [100, 110, None, 105, 98, 102],
        }
    )

    engine = HealthcareAnomalyEngine()
    result = engine.fit_predict(providers)

    assert engine.contamination == 0.05
    assert list(result.columns[-2:]) == ["is_anomaly", "anomaly_score"]
    assert result["is_anomaly"].notna().all()
    assert result["anomaly_score"].notna().all()
