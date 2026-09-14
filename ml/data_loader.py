"""
Data loading for the RailBuddy ML pipeline.

PREFERS a real dataset when present at `ml/data/real/train_delays.csv`, otherwise
falls back to the clearly-labelled SYNTHETIC demo dataset (generated on demand).

Loads the real Kaggle "indian-railways-predict-train-delay" schema and
normalises it to the pipeline's internal schema:

    departure_date   ->  journey_date      (ISO journey date)
    delay_minutes    ->  TARGET (delay_minutes)
    train_number     ->  str

Leakage / label columns are dropped at load time so they can never reach the
feature matrix:
    primary_delay_cause   (train-only post-hoc label)
    is_delayed            (label derived from delay_minutes)
    journey_id            (unique row identifier)
"""

from __future__ import annotations

from pathlib import Path

import pandas as pd

from ml import config as cfg

REQUIRED_COLUMNS = [
    "journey_date",
    "train_number",
    "delay_minutes",
]

# Pipeline column name -> source column in the raw CSV (when different)
COLUMN_ALIASES = {
    "departure_date": "journey_date",
}

# Dropped at load time (post-hoc labels / identifiers that would leak)
LEAKAGE_COLUMNS = ["primary_delay_cause", "is_delayed", "journey_id"]


def ensure_available() -> Path:
    """Make sure a dataset exists (cleaned real preferred, then raw real, then synthetic) and return its path."""
    if cfg.CLEAN_REAL_DATA_FILE.exists():
        return cfg.CLEAN_REAL_DATA_FILE
    if cfg.REAL_DATA_FILE.exists():
        return cfg.REAL_DATA_FILE
    cfg.ensure_dirs()
    if cfg.SYNTHETIC_FILE.exists():
        return cfg.SYNTHETIC_FILE
    from ml import synthetic_data

    return synthetic_data.synthesize()


def load_raw() -> tuple[pd.DataFrame, str]:
    """Load the raw dataset. Returns (df, source_label)."""
    path = ensure_available()
    if path.suffix == ".parquet":
        df = pd.read_parquet(path)
    else:
        df = pd.read_csv(path)

    # Rename source columns to the pipeline's internal schema.
    df = df.rename(columns=COLUMN_ALIASES)

    # Synthetic fallback exposes the target under the legacy name.
    if cfg.TARGET not in df.columns and "delay_next_minutes" in df.columns:
        df[cfg.TARGET] = df["delay_next_minutes"]

    missing = [c for c in REQUIRED_COLUMNS if c not in df.columns]
    if missing:
        raise ValueError(
            f"Dataset {path} is missing required columns: {missing}. "
            f"See ml/data/real/README.md for the expected schema."
        )

    # Enforce a no-leakage frame: identifiers and post-hoc labels are dropped.
    for c in LEAKAGE_COLUMNS:
        if c in df.columns:
            df = df.drop(columns=[c])

    df["journey_date"] = df["journey_date"].astype(str).str.slice(0, 10)
    df["train_number"] = df["train_number"].astype(str)
    df = df.sort_values("journey_date").reset_index(drop=True)
    if path == cfg.CLEAN_REAL_DATA_FILE:
        source = "REAL_CLEAN"
    elif cfg.REAL_DATA_FILE.exists():
        source = "REAL"
    elif "data_source" in df.columns:
        source = str(df["data_source"].iloc[0])
    else:
        source = "REAL"
    print(f"[load] dataset: {path}  (source: {source}, rows: {len(df)})")
    return df, source


def temporal_split(df: pd.DataFrame):
    """
    Split chronologically so the model is tested on data from after the training
    period (realistic time-series behaviour).

    Returns (train_idx_mask, test_idx_mask) boolean Series aligned to `df`.
    """
    dates = df["journey_date"].astype(str)
    n = len(df)
    test_start_row = int(n * (1 - cfg.TEST_FRACTION))
    # boundary by date so the same journey_date never straddles train/test
    boundary = dates.iloc[test_start_row]
    train_mask = dates < boundary
    test_mask = dates >= boundary
    if train_mask.sum() == 0 or test_mask.sum() == 0:
        raise RuntimeError("Temporal split produced empty partition; dataset too small.")
    return train_mask, test_mask