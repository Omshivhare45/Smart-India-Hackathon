"""
Central configuration for the RailBuddy ML pipeline.

Paths are resolved relative to the `ml/` directory so scripts can run
from anywhere inside the repository.
"""

from __future__ import annotations

from pathlib import Path

# Root of the ML module (directory containing this file)
ML_ROOT = Path(__file__).resolve().parent

# ---------------------------------------------------------------------------
# Data locations
# ---------------------------------------------------------------------------
DATA_DIR = ML_ROOT / "data"
REAL_DATA_DIR = DATA_DIR / "real"          # <-- drop a real dataset here (see data/real/README.md)
REAL_DATA_FILE = REAL_DATA_DIR / "train_delays.csv"
CLEAN_REAL_DATA_FILE = REAL_DATA_DIR / "train_delays_clean.parquet"  # preferred by the loader
CATALOG_FILE = DATA_DIR / "catalog.json"   # real route/schedule catalog extracted from src/data/trainData.ts

SYNTHETIC_DIR = DATA_DIR / "synthetic"
SYNTHETIC_FILE = SYNTHETIC_DIR / "train_delays_synthetic.csv"

# ---------------------------------------------------------------------------
# Feature engineering knobs
# ---------------------------------------------------------------------------
# Feature set derived from the real Kaggle "indian-railways-predict-train-delay"
# dataset (journey-level: one row per train journey, destination delay as target).
# Selected features are strictly pre-journey/at-departure information; lagging or
# post-hoc labels (primary_delay_cause, is_delayed) are excluded as leakage.
CATEGORICAL_FEATURES = [
    "train_number",
    "train_type",
    "season",
    "zone",
    "traction_type",
]
NUMERIC_FEATURES = [
    "year",
    "month",
    "day_of_week",
    "departure_hour",
    "distance_km",
    "num_scheduled_stops",
    "scheduled_travel_hours",
    "track_doubled",
    "is_hdn_route",
    "is_electrified",
    "is_monsoon_season",
    "is_fog_risk",
    "fog_risk_score",
    "late_incoming_rake",
    "maintenance_score",
    "seat_utilisation_pct",
    "is_overloaded",
]
TARGET = "delay_minutes"

# ---------------------------------------------------------------------------
# Training knobs
# ---------------------------------------------------------------------------
TEST_FRACTION = 0.25           # held-out test split (temporal: latest journeys)
VAL_FRACTION = 0.15            # validation split used for model selection
RANDOM_STATE = 42
N_JOBS = -1

# Confidence calibration: confidence = clip(1 - abs_error / SCALE, 0, 1).
# Scaled to the real-data delay distribution (destination delays 0-579 min,
# mean ~98 min).
CONFIDENCE_SCALE_MINUTES = 120.0

# ---------------------------------------------------------------------------
# Artifacts
# ---------------------------------------------------------------------------
# C: drive has no free space, so artifacts live on the D: drive.
ARTIFACTS_DIR = Path("D:/railbuddy_ml_artifacts")
MODEL_META_FILE = ARTIFACTS_DIR / "model_meta.json"
ENSEMBLE_FILE = ARTIFACTS_DIR / "ensemble.joblib"
PREPROCESSOR_FILE = ARTIFACTS_DIR / "preprocessor.joblib"
FEATURE_COLUMNS_FILE = ARTIFACTS_DIR / "feature_columns.json"
TRAIN_HISTORY_FILE = ARTIFACTS_DIR / "train_history.json"

# Nominal files for the 4 trained model configurations (2 algorithms x 2 configs)
MODEL_FILES = {
    "RandomForest-A": ARTIFACTS_DIR / "rf_a.joblib",
    "RandomForest-B": ARTIFACTS_DIR / "rf_b.joblib",
    "XGBoost-A": ARTIFACTS_DIR / "xgb_a.joblib",
    "XGBoost-B": ARTIFACTS_DIR / "xgb_b.joblib",
}

# ---------------------------------------------------------------------------
# API
# ---------------------------------------------------------------------------
API_HOST = "127.0.0.1"
API_PORT = 8000


def ensure_dirs() -> None:
    for d in (REAL_DATA_DIR, SYNTHETIC_DIR, ARTIFACTS_DIR):
        d.mkdir(parents=True, exist_ok=True)