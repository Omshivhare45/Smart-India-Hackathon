"""
Feature engineering.

Consumes the raw rows produced by the synthetic generator (or an equivalent real
CSV that matches `ml/data/real/README.md`) and produces the feature matrix used
for training and inference.

All features derive from fields that exist in the repository's route/schedule
data or that are standard calendar/positional transformations of them.
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from ml import config as cfg

# (group_cols, value_col, feature_prefix) — each is added ONLY when the raw
# frame contains the group/value columns required to compute it.
HIST_FEATURE_SPECS = [
    (["train_number"], "delay_current_minutes", "train_hist"),
    (["train_number", "station_code", "season"], "delay_current_minutes", "train_station_hist"),
]


def _ensure_numeric(df: pd.DataFrame, cols: list[str]) -> pd.DataFrame:
    for c in cols:
        if c in df.columns:
            df[c] = pd.to_numeric(df[c], errors="coerce")
    return df


def with_hist_features(
    train_df: pd.DataFrame,
    apply_to: pd.DataFrame,
    group_cols: list[str],
    value_col: str,
    prefix: str,
) -> pd.DataFrame:
    """
    Adds historical-average lag features computed over the TRAINING partition only
    (no leakage into validation/test). For journeys without history the feature is
    filled with the global training mean.

    Returns a copy of `apply_to` with the new feature columns.
    """
    out = apply_to.copy()
    base = train_df.copy()
    hist = base.groupby(group_cols)[value_col].mean().rename(f"{prefix}_avg")
    global_mean = float(base[value_col].mean())

    merged = out[[*group_cols]].merge(hist, left_on=group_cols, right_index=True, how="left")
    out[f"{prefix}_avg"] = merged[f"{prefix}_avg"].fillna(global_mean)
    return out


def build_features(df: pd.DataFrame, train_hist: pd.DataFrame | None = None) -> pd.DataFrame:
    """
    Build the full feature matrix (X + target) from raw rows.

    When `train_hist` is provided (the TRAINING partition), the historical-average
    features are fitted on it and applied to the passed frame — call this for
    validation/test/inference. When None, history is computed on the frame itself
    (used for the training partition).
    """
    df = _ensure_numeric(df, cfg.NUMERIC_FEATURES + [cfg.TARGET])

    # Historical-average lag features are only added when the frame actually
    # carries the source columns they need (e.g. the real journey-level dataset
    # has no station_code / delay_current_minutes, so they are skipped).
    hist_ref = train_hist if train_hist is not None else df
    for group_cols, value_col, prefix in HIST_FEATURE_SPECS:
        if value_col not in df.columns or not set(group_cols).issubset(df.columns):
            continue
        df = with_hist_features(hist_ref, df, group_cols, value_col, prefix)

    # Ensure every feature the model expects exists (defensive defaults).
    for c in cfg.NUMERIC_FEATURES + [cfg.TARGET]:
        if c not in df.columns:
            df[c] = np.nan
    for c in cfg.CATEGORICAL_FEATURES:
        if c not in df.columns:
            df[c] = "NA"

    return df


def make_train_matrices(df: pd.DataFrame):
    """Split into X (features) / y (target), dropping rows with missing target."""
    feats = build_features(df)
    X = feats[cfg.NUMERIC_FEATURES + cfg.CATEGORICAL_FEATURES].copy()
    y = feats[cfg.TARGET]
    X = X[y.notna()]
    y = y[y.notna()]
    y = y.clip(lower=0)  # delays are non-negative
    return X, y