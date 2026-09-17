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
from ml.eta_engine import (
    compute_dynamic_eta,
    estimate_congestion,
    snapshot_from_ntes,
    station_wise_eta,
)
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


def _station_index_no_raise(train, station_code, distance_covered_km=None) -> int:
    """Best-effort route index for a station code (no exceptions on miss)."""
    code = station_code or ""
    for i, stop in enumerate(train["route"]):
        if str(stop.get("stationCode")) == str(code):
            return i
    if distance_covered_km is not None:
        fallback = 0
        for i, stop in enumerate(train["route"]):
            km = (stop.get("distanceKm") or 0) or 0
            if km <= float(distance_covered_km):
                fallback = i
            else:
                break
        return fallback
    return 0


def _train_meta(train) -> dict:
    """Public train identity block used by the real-time prediction endpoint."""
    return {
        "trainNumber": train.get("trainNumber"),
        "trainName": train.get("trainName"),
        "type": train.get("type"),
        "sourceCode": train.get("sourceCode"),
        "sourceName": train.get("sourceName"),
        "destinationCode": train.get("destinationCode"),
        "destinationName": train.get("destinationName"),
        "distanceKm": train.get("distanceKm"),
        "duration": train.get("duration"),
        "departureTime": train.get("departureTime"),
        "arrivalTime": train.get("arrivalTime"),
    }


def _route_for_engine(train) -> list:
    """Catalog route normalized to the ETA engine's schedule-station shape."""
    out = []
    for stop in train["route"]:
        out.append(
            {
                "StationCode": stop.get("stationCode"),
                "StationName": stop.get("stationName"),
                "Distance": float(stop.get("distanceKm") or 0),
                "Halt": float(stop.get("haltMinutes") or 0),
                "STA": stop.get("scheduledArrival") or "",
                "STD": stop.get("scheduledDeparture") or "",
            }
        )
    return out


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

    # ---- Journey-level features for the model (real Kaggle schema) ----
    dep_str = train.get("departureTime") or "06:00 AM"
    dep_min = _minutes_of_day(dep_str) or 360.0

    season_map = {12: "Winter/Fog", 1: "Winter/Fog", 2: "Winter/Fog",
                  3: "Summer", 4: "Summer", 5: "Summer",
                  6: "Monsoon", 7: "Monsoon", 8: "Monsoon", 9: "Monsoon",
                  10: "Post-Monsoon", 11: "Post-Monsoon"}
    jd = req.journey_date
    if jd:
        try:
            from datetime import date
            y, m, dd = (int(x) for x in jd.split("-")[:3])
        except Exception:
            y, m, dd = 2026, 9, 11
        import datetime
        d = datetime.date(y, m, dd)
    else:
        import datetime
        d = datetime.date.today()
    season = season_map.get(d.month, "Autumn")

    catalog_type = train.get("type") or "Express"
    train_type_lookup = {
        "Vande Bharat": "Vande Bharat Express",
        "Rajdhani": "Rajdhani Express",
        "Shatabdi": "Shatabdi Express",
        "Duronto": "Duronto Express",
        "Superfast": "Superfast Express",
    }
    train_type = train_type_lookup.get(catalog_type, f"{catalog_type} Express" if catalog_type != "Express" else "Mail/Express")

    dur = train.get("duration") or "0h 00m"
    try:
        _h = int(str(dur).split("h")[0].strip())
        _m = int(str(dur).split("h")[1].split("m")[0].strip()) if "m" in str(dur).split("h")[1] else 0
    except Exception:
        _h, _m = 0, 0
    travel_hours = float(_h + _m / 60.0)
    total_km = float(train.get("distanceKm") or target_stop.get("distanceKm") or 0.0)

    row = build_feature_row(
        train_number=train["trainNumber"],
        journey_date=d.isoformat(),
        train_type=train_type,
        year=d.year,
        month=d.month,
        day_of_week=d.weekday(),
        departure_hour=(dep_min % 1440) / 60.0,
        season=season,
        distance_km=total_km,
        num_scheduled_stops=max(0, len(train["route"]) - 2),
        scheduled_travel_hours=travel_hours,
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


@app.get("/api/trains/{train_number}/prediction")
def live_prediction(
    train_number: str,
    journey_date: Optional[str] = None,
    station_code: Optional[str] = None,
    distance_covered_km: Optional[float] = None,
    current_speed_kmh: Optional[float] = None,
):
    """
    Real-Time Dynamic ETA for a train.

    Combines the trained ML base prediction with live NTES data through the
    Real-Time ETA Engine. Never modifies the ML model / artifacts. If the live
    feed is unavailable, live fields are marked unavailable and the engine
    falls back to the ML base prediction.
    """
    from datetime import datetime

    from ml.api.live import fetch_debug_payload

    catalog = _load_catalog()
    train = _get_train(catalog, train_number)
    route = train["route"]

    # 1) Live NTES payload - graceful fallback when the feed is down.
    live_payload = None
    try:
        live_payload = fetch_debug_payload(str(train_number), journey_date)
    except Exception:  # noqa: BLE001 - prediction must never 500 on a bad feed
        live_payload = None
    live_status = (live_payload or {}).get("live_status") or {}

    # 2) Resolve current position (best effort; defaults to source).
    current_index = _station_index_no_raise(
        train,
        live_status.get("LSTN") or station_code,
        distance_covered_km,
    )
    if current_index > len(route) - 1:
        current_index = len(route) - 1

    covered = distance_covered_km
    if covered is None and current_index > 0:
        covered = float(route[current_index].get("distanceKm") or 0)

    # 3) Base ML prediction (existing trained pipeline - unchanged 22 features).
    next_index = current_index + 1 if current_index + 1 < len(route) else current_index
    target_code = route[next_index].get("stationCode")
    base = predict(
        PredictRequest(
            train_number=str(train["trainNumber"]),
            station_code=str(route[current_index].get("stationCode")) or route[0].get("stationCode"),
            station_index=current_index,
            journey_date=journey_date,
            target=None if next_index == current_index else target_code,
        )
    )
    ml_base_delay = base.predicted_delay_minutes

    # 4) Normalize live fields + schedule for the engine.
    route_for_engine = _route_for_engine(train)
    snapshot = snapshot_from_ntes(
        live_status,
        route_for_engine,
        distance_covered_km=covered,
        current_speed_kmh=current_speed_kmh,
    )

    # Scheduled average pace (km/h) for the speed factor.
    sched_avg = None
    dur = train.get("duration") or ""
    try:
        _h = int(str(dur).split("h")[0].strip())
        _m_part = str(dur).split("h")[1] if "h" in str(dur) else ""
        _m = int(_m_part.split("m")[0].strip()) if _m_part and "m" in _m_part else 0
        travel_hours = _h + _m / 60.0
        total_km = snapshot.get("total_distance_km") or float(train.get("distanceKm") or 0)
        if travel_hours > 0 and total_km > 0:
            sched_avg = total_km / travel_hours
    except Exception:  # noqa: BLE001
        sched_avg = None
    snapshot["scheduled_avg_speed_kmh"] = sched_avg

    # 5) Engine: congestion, dynamic ETA, station-wise ETAs.
    congestion = estimate_congestion(snapshot, ml_base_delay)
    dynamic = compute_dynamic_eta(
        ml_base_delay=ml_base_delay,
        ml_confidence=float(base.confidence),
        snapshot=snapshot,
        congestion=congestion,
    )
    station_eta = station_wise_eta(
        schedule_stations=route_for_engine,
        snapshot=snapshot,
        projected_delay=float(dynamic["projected"]),
        final_delay=float(dynamic["final_predicted_delay"]),
        ml_confidence=float(base.confidence),
    )

    # 6) Destination ETA from the dynamically corrected delay.
    dest_stop = route[-1]
    dest_sched = dest_stop.get("scheduledArrival") or train.get("arrivalTime") or ""
    if not dest_sched or "Source" in str(dest_sched):
        dest_sched = train.get("arrivalTime") or ""
    dest_eta = expected_eta(str(dest_sched), dynamic["final_predicted_delay"]) if dest_sched else None

    return {
        "train": _train_meta(train),
        "live_status": {
            "live_available": bool(live_status),
            "current_station": live_status.get("LSTN"),
            "current_station_name": live_status.get("LSTNN"),
            "previous_station": live_status.get("NPSTN"),
            "next_station": live_status.get("NSTN"),
            "current_delay_minutes": snapshot.get("current_delay_minutes"),
            "current_speed_kmh": snapshot.get("current_speed_kmh"),
            "distance_covered_km": snapshot.get("distance_covered_km"),
            "total_distance_km": snapshot.get("total_distance_km"),
            "last_updated": live_status.get("LTIME") or snapshot.get("last_update"),
            "journey_date_used": (live_payload or {}).get("journey_date_used") or journey_date,
        },
        "congestion": congestion,
        "prediction": {
            "ml_base_delay": dynamic["ml_predicted_delay"],
            "live_adjusted_delay": dynamic["final_predicted_delay"],
            "confidence": dynamic["confidence"],
            "model_used": base.model_used,
            "target_eta": dest_eta,
            "target_station": f"{train.get('destinationName')} ({train.get('destinationCode')})",
            "scheduled_arrival": str(dest_sched),
            "breakdown": {
                "ml_predicted_delay": dynamic["ml_predicted_delay"],
                "current_live_delay": dynamic["current_live_delay"],
                "progress_factor": dynamic["progress_factor"],
                "speed_factor": dynamic["speed_factor"],
                "congestion_factor": dynamic["congestion_factor"],
            },
            "sources": dynamic["sources"],
        },
        "current_station": station_eta["current_station"],
        "upcoming_stations": station_eta["upcoming_stations"],
        "generated_at": datetime.now().isoformat(timespec="seconds"),
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host=cfg.API_HOST, port=cfg.API_PORT)