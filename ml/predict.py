"""
Inference helpers: load saved artifacts and produce a prediction.

Exposed for both the API (ml/api) and one-off scripts:
    predict_delay(feature_row: dict) -> dict
    expected_eta(scheduled_arrival, delay)   -> "HH:MM" / "THH:MM AM/PM"
"""

from __future__ import annotations

import json
from datetime import datetime, timedelta

import joblib
import numpy as np
import pandas as pd

from ml import config as cfg


class ModelBundle:
    """Lazily-loaded fitted models + preprocessor + metadata."""

    def __init__(self):
        self._fitted: dict[str, any] | None = None
        self._pre = None
        self._meta: dict | None = None
        self._weights: dict[str, float] | None = None
        self._best: str | None = None

    @property
    def loaded(self) -> bool:
        return self._fitted is not None

    def load(self) -> None:
        if self.loaded:
            return
        if not cfg.MODEL_META_FILE.exists():
            raise FileNotFoundError(
                "No trained models found. Run  python -m ml.train  first."
            )
        self._meta = json.loads(cfg.MODEL_META_FILE.read_text(encoding="utf-8"))
        self._pre = joblib.load(cfg.PREPROCESSOR_FILE)
        self._best = self._meta["best_model"]
        self._weights = self._meta["ensemble"]["weights"]
        self._fitted = {}
        for name, path in cfg.MODEL_FILES.items():
            if path.exists():
                self._fitted[name] = joblib.load(path)

    def predict(self, X: pd.DataFrame) -> tuple[np.ndarray, str, float]:
        """Returns (delay_prediction_array, model_used, confidence)."""
        self.load()
        preds = []
        for name, w in self._weights.items():
            if name in self._fitted:
                preds.append(w * self._fitted[name].predict(X))
        if preds:
            delay = sum(preds)
            model_used = f"Ensemble[{','.join(self._weights)}]"
        else:
            delay = self._fitted[self._best].predict(X)
            model_used = self._best

        # Confidence from best single model's test MAE, clipped to [0,1].
        best_mae = self._meta["test_metrics"][self._best]["mae"]
        confidence = float(np.clip(1.0 - best_mae / cfg.CONFIDENCE_SCALE_MINUTES, 0.0, 1.0))
        return np.asarray(delay), model_used, confidence


_bundle = ModelBundle()


def get_bundle() -> ModelBundle:
    return _bundle


def build_feature_row(
    *,
    train_number: str,
    journey_date: str | None = None,
    train_type: str = "Express",
    year: int | None = None,
    month: int | None = None,
    day_of_week: int | None = None,
    departure_hour: float = 0.0,
    season: str | None = None,
    zone: str = "Northern Railway",
    distance_km: float = 0.0,
    num_scheduled_stops: int = 0,
    scheduled_travel_hours: float = 0.0,
    track_doubled: int = 1,
    is_hdn_route: int = 0,
    traction_type: str = "Electric (25kV AC)",
    is_electrified: int = 1,
    is_monsoon_season: int | None = None,
    is_fog_risk: int | None = None,
    fog_risk_score: float = 0.0,
    late_incoming_rake: int = 0,
    maintenance_score: float = 7.0,
    seat_utilisation_pct: float = 80.0,
    is_overloaded: int = 0,
) -> dict:
    """
    Builds a single feature row the journey-level model can consume.

    All features are pre-journey / at-departure information from the real
    Kaggle dataset schema. Missing values are filled with neutral defaults that
    the preprocessor can handle (year/month/day_of_week are inferred from
    `journey_date` when omitted).
    """
    d = datetime.now()
    if journey_date:
        try:
            d = datetime.strptime(str(journey_date).strip(), "%Y-%m-%d")
        except ValueError:
            d = datetime.now()
    yr = year if year is not None else d.year
    mon = month if month is not None else d.month
    dow = day_of_week if day_of_week is not None else d.weekday()
    if season is None:
        season = {(12, 1, 2): "Winter/Fog", (3, 4, 5): "Summer", (6, 7, 8, 9): "Monsoon", (10, 11): "Post-Monsoon"}.get(d.month, "Autumn")

    return {
        **{c: None for c in cfg.NUMERIC_FEATURES},
        **{c: "NA" for c in cfg.CATEGORICAL_FEATURES},
        "train_number": str(train_number),
        "train_type": train_type,
        "season": season,
        "zone": zone,
        "traction_type": traction_type,
        "year": yr,
        "month": mon,
        "day_of_week": dow,
        "departure_hour": float(departure_hour),
        "distance_km": float(distance_km),
        "num_scheduled_stops": int(num_scheduled_stops),
        "scheduled_travel_hours": float(scheduled_travel_hours),
        "track_doubled": int(track_doubled),
        "is_hdn_route": int(is_hdn_route),
        "is_electrified": int(is_electrified),
        "is_monsoon_season": int(is_monsoon_season) if is_monsoon_season is not None else (1 if 6 <= mon <= 9 else 0),
        "is_fog_risk": int(is_fog_risk) if is_fog_risk is not None else (1 if d.month in (12, 1, 2) else 0),
        "fog_risk_score": float(fog_risk_score),
        "late_incoming_rake": int(late_incoming_rake),
        "maintenance_score": float(maintenance_score),
        "seat_utilisation_pct": float(seat_utilisation_pct),
        "is_overloaded": int(is_overloaded),
    }


def predict_from_row(row: dict) -> dict:
    """Predict delay for a single feature row. Returns API-style payload."""
    bundle = get_bundle()
    X = pd.DataFrame([row])[cfg.NUMERIC_FEATURES + cfg.CATEGORICAL_FEATURES]
    delay_arr, model_used, confidence = bundle.predict(X)
    delay = float(max(0.0, delay_arr[0]))
    return {
        "predicted_delay_minutes": round(delay, 1),
        "model_used": model_used,
        "confidence": round(confidence, 3),
        "delay_uncalibrated": round(delay_arr[0], 1),
    }


def expected_eta(scheduled_time: str, delay_minutes: float) -> str:
    """
    scheduled_time may be "HH:MM AM/PM", "HH:MM", or 'X day HH:MM'.
    Returns ETA as a wall-clock string with day rollover noted.
    """
    s = str(scheduled_time).strip()
    base = s
    if "day" in s.lower():
        parts = s.lower().split()
        base = parts[-1] if len(parts) >= 2 else s
    try:
        t = datetime.strptime(base.strip().upper(), "%I:%M %p")
    except ValueError:
        try:
            t = datetime.strptime(base.strip(), "%H:%M")
        except ValueError:
            return scheduled_time
    eta = t + timedelta(minutes=delay_minutes)
    return eta.strftime("%I:%M %p")