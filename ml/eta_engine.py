"""
Real-Time ETA Engine.

Combines the trained (historical/static) ML prediction with live train data to
produce a transparent, dynamic ETA breakdown WITHOUT changing the ML model or
its 22-feature schema.

Architecture
------------
    Historical ML Model  ──►  Base Predicted Delay  ─┐
                                                     ├─► Real-Time ETA Engine ─► Dynamic ETA
    Live Train Data (NTES) ──► Live Snapshot  ───────┘

Rules
-----
1. LIVE fields only ever originate from real API data (NTES) or explicit caller
   inputs. Missing values are marked "unavailable" and never invented.
2. The trained model is NEVER called with new live features - it continues to
   receive exactly the 22 features it was trained on.
3. Every numeric factor below is a labelled ESTIMATE derived from an explicit
   formula; the `sources` dict records whether each number came from a live
   observation or was estimated/neutral.
"""

from __future__ import annotations

from typing import Any, Optional

from ml.predict import expected_eta


# ---------------------------------------------------------------------------
# Small numeric helpers
# ---------------------------------------------------------------------------

def _f(value: Any) -> Optional[float]:
    """Coerce to float, None if not numeric."""
    if value is None or value == "":
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _clip(v: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, v))


# ---------------------------------------------------------------------------
# NTES payload -> normalized "live snapshot"
# ---------------------------------------------------------------------------

def snapshot_from_ntes(
    live_status: Optional[dict],
    schedule_stations: Optional[list],
    *,
    distance_covered_km: Optional[float] = None,
    current_speed_kmh: Optional[float] = None,
) -> dict:
    """
    Normalize the raw NTES `live_status` + `schedule.stations` payloads into a
    single snapshot. Fields that NTES does not provide (speed, GPS distance)
    stay None - marked unavailable.

    `schedule_stations` mirrors the catalog/NTES schedule station list
    (already in journey order) with keys: StationCode, Distance, Halt, STA, ...
    """
    live = live_status if isinstance(live_status, dict) else {}
    sched = schedule_stations if isinstance(schedule_stations, list) else []

    live_available = bool(live) and len(sched) > 0

    current_code = live.get("LSTN") or None
    current_name = live.get("LSTNN") or None
    next_code = live.get("NSTN") or None
    prev_code = live.get("NPSTN") or None

    # Distance covered: caller-provided override, else the last passed schedule
    # station's cumulative distance.
    covered = distance_covered_km if distance_covered_km is not None else None
    if covered is None and current_code is not None:
        passed = [
            _f(s.get("Distance"))
            for s in sched
            if s.get("StationCode") == current_code
        ]
        if passed and passed[0] is not None:
            covered = passed[0]  # current station reached -> distance covered to it

    total_distance = 0.0
    for s in sched:
        d = _f(s.get("Distance"))
        if d is not None:
            total_distance = max(total_distance, d)

    # Per-station observed delays (from NTES DARR/DDEP strings or numbers).
    delays: list[dict] = []
    stns = live.get("STNS") or []
    if isinstance(stns, list):
        for st in stns:
            sc = st.get("SC")
            if not sc:
                continue
            dd = _f(st.get("DDEP"))
            da = _f(st.get("DARR"))
            delay = dd if dd is not None else da
            if delay is not None:
                delays.append({"station_code": sc, "delay_minutes": delay})

    # Scheduled halt minutes for the current station (for extended-halt factor).
    sched_halt = None
    if current_code is not None:
        for s in sched:
            if s.get("StationCode") == current_code:
                sched_halt = _f(s.get("Halt"))
                break

    return {
        # Provenance
        "live_available": live_available,
        "last_update": live.get("LTIME") or None,
        # Position
        "current_station": current_code,
        "current_station_name": current_name,
        "previous_station": prev_code,
        "next_station": next_code,
        # Delay / speed / progress
        "current_delay_minutes": _f(live.get("LDEL")),
        "current_speed_kmh": current_speed_kmh,
        "distance_covered_km": covered,
        "total_distance_km": total_distance,
        "station_delays": delays,
        "scheduled_halt_minutes": sched_halt,
        "schedule_available": len(sched) > 0,
    }


# ---------------------------------------------------------------------------
# Congestion analysis (estimated, from observable factors only)
# ---------------------------------------------------------------------------

def _level_for_score(score: Optional[float]) -> str:
    if score is None:
        return "UNKNOWN"
    if score < 35:
        return "LOW"
    if score < 65:
        return "MEDIUM"
    return "HIGH"


def estimate_congestion(snapshot: dict, ml_base_delay: float) -> dict:
    """
    Estimated congestion score (0-100) + level + per-factor breakdown.

    Only observable/derived signals are used:
      - current live delay (or the ML base delay as an ESTIMATE when live is gone)
      - delay trend across the last passed stations (NTES STNS)
      - speed loss vs schedule (only if a speed input is provided)
      - extended halt at the current station (live delay > scheduled halt)

    It NEVER invents "trains ahead" / signal data, which our APIs do not give us.
    Returns:
        {
          "score": float|None, "level": "...", "estimated": bool,
          "basis": "live" | "live_and_estimate" | "ml_estimate" | "none",
          "factors": [ {"name", "value", "source", "score"} ]
        }
    """
    factors: list[dict] = []
    parts: list[tuple[float, str]] = []  # (score, source_label)

    live_delay = snapshot.get("current_delay_minutes")
    speed = snapshot.get("current_speed_kmh")
    delays = snapshot.get("station_delays") or []
    halted_min = snapshot.get("scheduled_halt_minutes")

    # 1) Delay heat
    if live_delay is not None:
        score = _clip(live_delay / 120.0, 0.0, 1.0) * 100.0
        parts.append((score, "live"))
        factors.append({
            "name": "current_train_delay",
            "value": round(float(live_delay), 1),
            "unit": "min",
            "source": "live_ntes",
            "score": round(score, 1),
        })
    else:
        score = _clip(ml_base_delay / 120.0, 0.0, 1.0) * 100.0
        parts.append((score, "ml_estimate"))
        factors.append({
            "name": "current_train_delay",
            "value": round(float(ml_base_delay), 1),
            "unit": "min (estimated)",
            "source": "ml_base_estimate",
            "score": round(score, 1),
        })

    # 2) Delay trend across last passed stations (>= 2 observations)
    if len(delays) >= 2:
        seq = [float(d["delay_minutes"]) for d in delays]
        slope = (seq[-1] - seq[0]) / max(len(seq) - 1, 1)
        trend_score = _clip((slope / 20.0), 0.0, 1.0) * 100.0  # +20min/station = 100
        parts.append((trend_score, "live"))
        factors.append({
            "name": "delay_trend_across_stations",
            "value": round(slope, 2),
            "unit": "min/station",
            "source": "live_ntes",
            "score": round(trend_score, 1),
        })

    # 3) Speed loss vs scheduled pace (only when a speed is actually provided)
    if speed is not None:
        sched_avg = snapshot.get("scheduled_avg_speed_kmh")
        if sched_avg and sched_avg > 0:
            ratio = (float(speed)) / float(sched_avg)
            loss = _clip((1.0 - ratio) / 0.5, 0.0, 1.0) * 100.0  # half speed = 100
            parts.append((loss, "live"))
            factors.append({
                "name": "speed_reduction",
                "value": round(float(speed), 1),
                "unit": "km/h",
                "source": "api_request",
                "score": round(loss, 1),
            })

    # 4) Extended halt at current station
    if live_delay is not None and halted_min is not None:
        extra = float(live_delay) - float(halted_min)
        if extra > 0:
            halt_score = _clip((extra / 30.0), 0.0, 1.0) * 100.0
            parts.append((halt_score, "live"))
            factors.append({
                "name": "extended_station_halt",
                "value": round(extra, 1),
                "unit": "min beyond schedule",
                "source": "live_ntes",
                "score": round(halt_score, 1),
            })

    live_parts = [s for s, src in parts if src == "live"]
    est_parts = [s for s, src in parts if src == "ml_estimate"]

    if not parts:
        return {
            "score": None,
            "level": "UNKNOWN",
            "estimated": True,
            "basis": "none",
            "factors": [
                {"name": "no_signals", "value": None, "unit": None,
                 "source": "unavailable",
                 "score": None}
            ],
        }

    score = round(sum(s for s, _ in parts) / len(parts), 1)
    if live_parts:
        basis = "live"
    elif est_parts:
        basis = "ml_estimate"
    else:
        basis = "live_and_estimate"

    return {
        "score": score,
        "level": _level_for_score(score),
        "estimated": bool(est_parts) and not live_parts,
        "basis": basis,
        "factors": factors,
    }


# ---------------------------------------------------------------------------
# Dynamic ETA (blend ML + live, apply transparent factors)
# ---------------------------------------------------------------------------

def compute_dynamic_eta(
    *,
    ml_base_delay: float,
    ml_confidence: float,
    snapshot: dict,
    congestion: dict,
) -> dict:
    """
    Combine the ML base prediction with live data into a single dynamic ETA.

    Factor math (documented, all transparent):
      progress       = distance_covered / total_distance            (0..1)
      live_weight    = 0.25 + 0.55 * progress   [when live delay exists]
      projected      = live_weight*live_delay + (1-live_weight)*ml_base_delay
                       (or ml_base_delay when no live delay)
      speed_factor   = scheduled_avg_speed / current_speed, clipped 0.6-1.5
                       (1.0 when speed unavailable; >1 means lagging schedule)
      congestion_mult= 1 + 0.5*(congestion_score/100)               (1.00-1.50)
      final_delay    = projected * speed_factor * congestion_mult
    """
    live_delay = snapshot.get("current_delay_minutes")
    covered = snapshot.get("distance_covered_km")
    total = snapshot.get("total_distance_km") or 0.0
    speed = snapshot.get("current_speed_kmh")
    sched_avg = snapshot.get("scheduled_avg_speed_kmh")

    # progress
    progress = 0.0
    if covered is not None and total and total > 0:
        progress = _clip(float(covered) / float(total), 0.0, 0.97)
    progress_available = covered is not None and total > 0

    # blend live + ML
    if live_delay is not None:
        live_w = 0.25 + 0.55 * progress
        projected = live_w * float(live_delay) + (1.0 - live_w) * float(ml_base_delay)
        live_used = True
    else:
        projected = float(ml_base_delay)
        live_used = False

    # speed factor
    speed_mult = 1.0
    speed_available = speed is not None and sched_avg is not None and sched_avg > 0
    if speed_available:
        speed_mult = _clip(float(sched_avg) / float(speed), 0.6, 1.5)

    # congestion factor
    cong_score = congestion.get("score")
    cong_mult = 1.0
    if cong_score is not None:
        cong_mult = 1.0 + 0.5 * (float(cong_score) / 100.0)

    final_delay = float(projected) * speed_mult * cong_mult

    # confidence: scale the ML confidence by live-data quality
    quality = 1.0
    if live_used:
        quality += 0.15
    if progress_available:
        quality += 0.10
    if speed_available:
        quality += 0.10
    if cong_score is not None and "live" in (congestion.get("basis") or ""):
        quality += 0.10
    confidence = round(_clip(float(ml_confidence) * quality, 0.05, 0.95), 3)

    return {
        "ml_predicted_delay": round(float(ml_base_delay), 1),
        "current_live_delay": round(float(live_delay), 1) if live_delay is not None else None,
        "progress_factor": round(progress, 3),
        "speed_factor": round(speed_mult, 3),
        "congestion_factor": round(cong_mult, 3),
        "final_predicted_delay": round(final_delay, 1),
        "confidence": confidence,
        "sources": {
            "live_delay": "live_ntes" if live_used else "unavailable",
            "progress": "calculated" if progress_available else "unavailable",
            "speed": "api_request" if speed_available else "unavailable",
            "congestion": congestion.get("basis") or "unavailable",
            "ml_base": "trained_model",
        },
        "projected": round(projected, 1),
    }


# ---------------------------------------------------------------------------
# Station-wise ETA for every upcoming stop
# ---------------------------------------------------------------------------

def station_wise_eta(
    *,
    schedule_stations: list,
    snapshot: dict,
    projected_delay: float,
    final_delay: float,
    ml_confidence: float,
) -> dict:
    """
    Build per-station predictions for ALL upcoming scheduled stations.

    For station s:
        alpha     = fraction of the remaining route already covered reaching s
                    (0 at the current position, 1 at the destination)
        delay_s   = live_delay  if alpha==0 (current position)
                  = (1-alpha)*live_delay + alpha*projected_delay   [live available]
                  = final_delay * alpha                            [no live data]
        eta_s     = scheduled_arrival(s) + delay_s

    Stations are clearly labelled with where their number came from
    ("live_corrected" vs "ml_projected").
    """
    current_code = snapshot.get("current_station")
    covered = snapshot.get("distance_covered_km")
    total = snapshot.get("total_distance_km") or 0.0
    live_delay = snapshot.get("current_delay_minutes")
    has_live = live_delay is not None

    covered_km = float(covered) if covered is not None else 0.0
    remaining_total = max(float(total) - covered_km, 0.0)

    current_info: dict = {
        "station_name": snapshot.get("current_station_name"),
        "station_code": current_code,
        "current_delay_minutes": round(float(live_delay), 1) if has_live else None,
        "last_update": snapshot.get("last_update"),
    }

    upcoming: list[dict] = []
    for idx, st in enumerate(schedule_stations):
        code = st.get("StationCode")
        if not code:
            continue
        km = _f(st.get("Distance")) or 0.0
        if km <= covered_km + 0.001:
            continue  # passed
        if current_code is not None and code == current_code:
            continue  # current halt

        remaining = max(float(km) - covered_km, 0.0)
        alpha = (float(km) - covered_km) / remaining_total if remaining_total > 0 else 1.0
        alpha = _clip(alpha, 0.0, 1.0)

        if has_live:
            delay_s = (1.0 - alpha) * float(live_delay) + alpha * float(projected_delay)
            source = "live_corrected"
        else:
            delay_s = float(final_delay) * alpha
            source = "ml_projected"

        sched_arr = st.get("STA") or ""
        if sched_arr in ("", "Source"):
            sched_arr_display = "Source"
            eta = None
        else:
            sched_arr_display = sched_arr
            eta = expected_eta(str(sched_arr), delay_s)

        confidence = round(_clip(float(ml_confidence) * (1.0 - 0.35 * alpha), 0.05, 0.95), 3)

        upcoming.append({
            "station_name": st.get("StationName") or code,
            "station_code": code,
            "station_index": idx,
            "distance_remaining_km": round(remaining, 1),
            "scheduled_arrival": sched_arr_display,
            "predicted_delay_minutes": round(delay_s, 1),
            "predicted_eta": eta,
            "confidence": confidence,
            "delay_source": source,
        })

    return {
        "current_station": current_info,
        "upcoming_stations": upcoming,
    }