"""Plain-language anomaly explanation generator (MA-23).

Turns flagged anomaly rows (``anomaly_flag == -1``) into a human-readable
heuristic string comparing each feature's value against its peer group
average.
"""

from __future__ import annotations

import pandas as pd

ANOMALY_FLAG_VALUE = -1


def _describe_feature(feature: str, value: float, peers: pd.Series, group_value: object) -> str:
    if peers.empty:
        return f"{feature} has no peer records in the {group_value} group for comparison"

    group_average = peers.mean()
    if group_average == 0:
        return f"{feature} is {value:g} vs a {group_value} group average of 0"

    multiplier = value / group_average
    direction = "above" if value >= group_average else "below"
    return f"{feature} is {multiplier:.1f}x {direction} the {group_value} average"


def generate_anomaly_explanations(
    df: pd.DataFrame,
    feature_cols: list[str],
    group_col: str = "specialty",
) -> pd.DataFrame:
    """Return a copy of ``df`` with an ``anomaly_explanation`` column for flagged rows."""
    result = df.copy()
    result["anomaly_explanation"] = None

    for idx, row in result.iterrows():
        if row["anomaly_flag"] != ANOMALY_FLAG_VALUE:
            continue

        group_value = row[group_col]
        peer_mask = (result[group_col] == group_value) & (result.index != idx)
        peers = result.loc[peer_mask]

        explanations = [
            _describe_feature(feature, row[feature], peers[feature], group_value)
            for feature in feature_cols
        ]
        result.at[idx, "anomaly_explanation"] = "; ".join(explanations)

    return result


__all__ = ["generate_anomaly_explanations"]
