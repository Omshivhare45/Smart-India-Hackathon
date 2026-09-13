"""
FastAPI prediction backend for the RailBuddy ETA / delay prediction system.

Run:
    python -m ml.api.main        (or)  uvicorn ml.api.main:app --reload

Endpoints:
    GET  /health                 service + model availability
    POST /api/predict            {"train_number","station_code",...} -> delay/ETA/confidence
    GET  /api/models             trained model comparison from model_meta.json
    GET  /api/live/train/{no}    real-time NTES feed (debug: raw search/info/schedule/status)
"""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Optional

# Make the `ml` package importable regardless of the working directory.
# Render deploys with Root Directory = "ml" and starts `uvicorn api.main:app`,
# where the repo root (parent of ml/) is NOT on sys.path. Inserting it keeps
# the absolute `from ml import ...` imports working while nothing changes for
# local runs from the repository root (`python -m uvicorn ml.api.main:app`).
_REPO_ROOT = Path(__file__).resolve().parents[2]
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

import pandas as pd
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from ml import config as cfg
from ml.api.schemas import HealthResponse, PredictionResponse, PredictRequest
from ml.predict import build_feature_row, expected_eta, get_bundle

app = FastAPI(
    title="RailBuddy ML — Train ETA & Delay Prediction",
    version="1.0.0",
    description="AI-powered real-time train ETA and delay prediction (SIH 2026).",
)

# Allow the Next.js frontend (dev + Vercel-style origins) to call the API.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _load_catalog():
    try:
        return json.loads(cfg.CATALOG_FILE.read_text(encoding="utf-8"))
    except FileNotFoundError:
        raise HTTPException(500, "Route catalog missing. Run  node ml/scripts/extract_catalog.mjs")


def _get_train(catalog, train_number: str):
    train = next((t for t in catalog["trains"] if t["trainNumber"] == str(train_number)), None)
    if train is None:
        raise HTTPException(404, f"Train {train_number} not found in route catalog")
    return train


def _minutes_of_day(s: Optional[str]) -> Optional[float]:
    if not s:
        return None
    s = s.strip()
    for pre in ("Expected", "Source", "Destination"):
        if s.startswith(pre):
            s = s.replace(pre, "", 1).strip()
    if not s:
        return None
    try:
        if s.endswith("AM") or s.endswith("PM"):
            t = pd.to_datetime(s, format="%I:%M %p")
        else:
            t = pd.to_datetime(s, format="%H:%M")
        return float(t.hour * 60 + t.minute)
    except ValueError:
        return None


def _resolve_station_index(train, station_code: str) -> int:
    for i, stop in enumerate(train["route"]):
        if stop["stationCode"] == station_code:
            return i
    raise HTTPException(404, f"Station {station_code} is not on the route of train {train['trainNumber']}")


@app.get("/health", response_model=HealthResponse)
def health():
    trained = cfg.MODEL_META_FILE.exists()
    meta = None
    if trained:
        meta = json.loads(cfg.MODEL_META_FILE.read_text(encoding="utf-8"))
    return HealthResponse(
        status="ok",
        trained=trained,
        best_model=meta["best_model"] if meta else None,
        n_features=len(cfg.NUMERIC_FEATURES + cfg.CATEGORICAL_FEATURES),
    )


@app.get("/api/models")
def model_info():
    if not cfg.MODEL_META_FILE.exists():
        raise HTTPException(503, "No trained models yet. Run  python -m ml.train")
    meta = json.loads(cfg.MODEL_META_FILE.read_text(encoding="utf-8"))
    return {
        "best_model": meta["best_model"],
        "data_source": meta["data_source"],
        "test_metrics": meta["test_metrics"],
        "ensemble_metrics": meta["test_ensemble_metrics"],
        "ensemble_weights": meta["ensemble"]["weights"],
        "features": meta["features"],
    }


@app.get("/api/live/train/{train_number}")
def live_train(train_number: str, journey_date: Optional[str] = None):
    """
    Real-time NTES feed for a train (debug payload).

    Returns the raw NTES responses from search / train_info / schedule /
    live_status labelled with data_source="ntes", plus a `pipeline` array with
    per-step provenance. Partial failures are returned with HTTP 200 and
    success=False so callers can see exactly which stage failed; HTTP 502
    is reserved for hard crashes of the provider itself.
    """
    from ml.api.live import fetch_debug_payload

    try:
        payload = fetch_debug_payload(str(train_number), journey_date)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(502, f"NTES live feed unavailable: {exc}")
    return payload


@app.post("/api/predict", response_model=PredictionResponse)
def predict(req: PredictRequest):
    catalog = _load_catalog()
    train = _get_train(catalog, req.train_number)

    idx = req.station_index if req.station_index is not None else _resolve_station_index(train, req.station_code)
    if idx < 0 or idx >= len(train["route"]):
        raise HTTPException(422, f"Invalid station index {idx} for train {train['trainNumber']}")

    # Target station: next scheduled stop after current (or explicitly requested target)
    if req.target:
        target_idx = _resolve_station_index(train, req.target)
        if target_idx <= idx:
            raise HTTPException(422, "Target station must be ahead of the current station")
    else:
        target_idx = idx + 1 if idx + 1 < len(train["route"]) else idx
    stop = train["route"][idx]
    target_stop = train["route"][target_idx]

    total_km = float(train.get("distanceKm") or target_stop.get("distanceKm") or 0.0)
    dist_km = req.distance_covered_km if req.distance_covered_km is not None else float(stop.get("distanceKm") or 0.0)

    dep_str = train.get("departureTime") or "06:00 AM"
    dep_min = _minutes_of_day(dep_str) or 360.0
    sched_arr_min = _minutes_of_day(stop.get("scheduledArrival"))

    season_map = {12: "winter", 1: "winter", 2: "winter", 3: "summer", 4: "summer", 5: "summer",
                  6: "monsoon", 7: "monsoon", 8: "monsoon", 9: "monsoon", 10: "post_monsoon", 11: "post_monsoon"}
    jd = req.journey_date
    if jd:
        try:
            from datetime import date
            y, m, dd = (int(x) for x in jd.split("-")[:3])
        except Exception:
            y, m, dd = 2026, 9, 11
        import datetime
        d = datetime.date(y, m, dd)
        season = season_map.get(d.month, "summer")
        dow = d.weekday()
        month = d.month
    else:
        import datetime
        d = datetime.date.today()
        season = season_map.get(d.month, "summer")
        dow = d.weekday()
        month = d.month

    cum_halt = sum(float(s.get("haltMinutes") or 0.0) for s in train["route"][:idx])

    row = build_feature_row(
        train_number=train["trainNumber"],
        train_type=train["type"],
        season=season,
        station_index=idx,
        total_stops=len(train["route"]),
        distance_km=dist_km,
        total_distance_km=total_km,
        distance_to_next_km=float(target_stop.get("distanceKm") or 0.0) - dist_km,
        scheduled_departure_hour=(dep_min % 1440) / 60.0,
        scheduled_arrival_minutes=float(sched_arr_min or dep_min),
        journey_date=req.journey_date,
        delay_current_minutes=req.delay_current_minutes,
        current_speed_kmh=req.current_speed_kmh,
        cumulative_halt_minutes=cum_halt,
        halt_minutes=float(stop.get("haltMinutes") or 0.0),
        day_of_week=dow,
        is_weekend=1 if dow >= 5 else 0,
        month=month,
    )

    bundle = get_bundle()
    try:
        bundle.load()
    except FileNotFoundError:
        raise HTTPException(
            503,
            "No trained models found. Run  python -m ml.train  inside the ml/ directory first.",
        )

    X = pd.DataFrame([row])
    delay, model_used, confidence = bundle.predict(X)
    delay_min = max(0.0, float(delay[0]))

    # ETA at TARGET station = scheduled arrival at target + predicted delay
    target_sched = target_stop.get("scheduledArrival") or "Arrival"
    if target_sched and "Source" not in str(target_sched):
        eta = expected_eta(str(target_sched), delay_min)
    else:
        eta = str(target_sched)

    meta = json.loads(cfg.MODEL_META_FILE.read_text(encoding="utf-8"))
    return PredictionResponse(
        predicted_delay_minutes=round(delay_min, 1),
        predicted_eta=eta,
        confidence=confidence,
        model_used=model_used,
        target_station=f"{target_stop['stationName']} ({target_stop['stationCode']})",
        scheduled_arrival=str(target_sched),
        data_source=meta.get("data_source", "unknown"),
    )


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host=cfg.API_HOST, port=cfg.API_PORT)