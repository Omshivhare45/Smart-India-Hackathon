"""
Real-data cleaning pipeline for the RailBuddy ML system.

Reads the raw real journey-level dataset `ml/data/real/train_delays.csv`,
validates it end-to-end, strips ML-leakage/identifier columns, normalises the
schema (departure_date -> journey_date as datetime, train_number as string),
and writes:

    ml/data/real/train_delays_clean.parquet  (primary, preferred by the loader)
    ml/data/real/train_delays_clean.csv      (optional; skip with --no-csv)
    ml/data/real/cleaning_report.json        (validation & provenance audit)

Extreme-but-valid delays are FLAGGED and reported, never removed. Only rows with
an impossible target (non-numeric or negative delay) or an unparseable journey
date are dropped.

Usage:
    python ml/scripts/clean_real_data.py [--no-csv] [--extreme-minutes 1440]
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
import pandas as pd

REPO_ROOT = Path(__file__).resolve().parents[2]
REAL_DIR = REPO_ROOT / "ml" / "data" / "real"

RAW_DATA_FILE = REAL_DIR / "train_delays.csv"
CLEAN_PARQUET_FILE = REAL_DIR / "train_delays_clean.parquet"
CLEAN_CSV_FILE = REAL_DIR / "train_delays_clean.csv"
REPORT_FILE = REAL_DIR / "cleaning_report.json"

TARGET = "delay_minutes"
LEAK_COLUMNS = ["journey_id", "primary_delay_cause", "is_delayed"]
COLUMN_RENAMES = {"departure_date": "journey_date"}

NUMERIC_COLUMNS = [
    "year", "month", "day_of_week", "departure_hour", "is_weekend",
    "is_night_departure", "is_peak_hour", "is_festival_season", "distance_km",
    "num_scheduled_stops", "scheduled_travel_hours", "track_doubled",
    "is_hdn_route", "psr_count", "is_circular_route", "is_monsoon_season",
    "is_fog_risk", "fog_risk_score", "zone_fog_index", "zone_congestion_index",
    "season_severity_score", "loco_age_years", "coach_age_years",
    "has_lhb_coaches", "is_rake_shared", "maintenance_score",
    "seat_utilisation_pct", "is_overloaded", "late_incoming_rake",
    "is_special_train", "route_historical_ontime_pct", TARGET,
]

BINARY_COLUMNS = [
    "is_weekend", "is_night_departure", "is_peak_hour", "is_festival_season",
    "track_doubled", "is_hdn_route", "is_circular_route", "is_monsoon_season",
    "is_fog_risk", "has_lhb_coaches", "is_rake_shared", "is_overloaded",
    "late_incoming_rake", "is_special_train",
]


def size_bytes(path: Path) -> int:
    return int(path.stat().st_size)


def main() -> None:
    ap = argparse.ArgumentParser(description="Clean the RailBuddy real dataset.")
    ap.add_argument("--no-csv", action="store_true",
                    help="skip writing the cleaned CSV output")
    ap.add_argument("--extreme-minutes", type=int, default=1440,
                    help="delay in minutes at/above which a value is flagged as "
                         "extreme (default 1440 = 24h); flagged, never removed")
    args = ap.parse_args()

    report: dict = {}

    # ---- 1. Load ----
    raw = pd.read_csv(RAW_DATA_FILE, dtype={"train_number": str})
    report["source_file"] = str(RAW_DATA_FILE)
    report["original_rows"] = int(len(raw))
    report["original_columns"] = int(len(raw.columns))
    report["columns"] = list(raw.columns)
    report["data_types_before"] = {str(c): str(t) for c, t in raw.dtypes.items()}

    validation: dict = {}

    # ---- 2. Duplicates ----
    dup_count = int(raw.duplicated().sum())
    df = raw.drop_duplicates().reset_index(drop=True)
    validation["duplicates_found"] = dup_count
    report["duplicates_removed"] = dup_count

    # ---- 3. Missing values before ----
    miss_before = {str(c): int(v) for c, v in raw.isna().sum().items() if v > 0}
    report["missing_values_before"] = int(sum(miss_before.values()))
    if miss_before:
        validation["missing_before_by_column"] = miss_before

    # ---- 4. Schema normalisation ----
    removed_cols = [c for c in LEAK_COLUMNS if c in df.columns]
    if removed_cols:
        df = df.drop(columns=removed_cols)
    report["removed_columns"] = removed_cols

    if "journey_date" not in df.columns and "departure_date" in df.columns:
        df = df.rename(columns=COLUMN_RENAMES)
    if "journey_date" not in df.columns:
        raise ValueError(f"journey_date column not found; have: {list(df.columns)}")

    # ---- 5. Numeric / data-type validation (flag only, except target) ----
    invalid_numeric: dict[str, int] = {}
    for c in NUMERIC_COLUMNS:
        if c not in df.columns:
            continue
        coerced = pd.to_numeric(df[c], errors="coerce")
        bad = bool(df[c].notna().any()) and bool((df[c].notna() & coerced.isna()).any())
        if bad:
            invalid_numeric[str(c)] = int((df[c].notna() & coerced.isna()).sum())
    if invalid_numeric:
        validation["invalid_numeric_values"] = invalid_numeric

    range_issues: dict[str, int] = {}
    for c in BINARY_COLUMNS:
        if c in df.columns:
            v = pd.to_numeric(df[c], errors="coerce")
            out_of_range = int(((v != 0) & (v != 1) & v.notna()).sum())
            if out_of_range:
                range_issues[f"{c} (binary)"] = out_of_range
    if "departure_hour" in df.columns:
        v = pd.to_numeric(df["departure_hour"], errors="coerce")
        oob = int(((v < 0) | (v > 23) & v.notna()).sum())
        if oob:
            range_issues["departure_hour (0..23)"] = oob
    if "day_of_week" in df.columns:
        v = pd.to_numeric(df["day_of_week"], errors="coerce")
        oob = int(((v < 0) | (v > 6) & v.notna()).sum())
        if oob:
            range_issues["day_of_week (0..6)"] = oob
    if "month" in df.columns:
        v = pd.to_numeric(df["month"], errors="coerce")
        oob = int(((v < 1) | (v > 12) & v.notna()).sum())
        if oob:
            range_issues["month (1..12)"] = oob
    if "maintenance_score" in df.columns:
        v = pd.to_numeric(df["maintenance_score"], errors="coerce")
        oob = int(((v < 1) | (v > 10) & v.notna()).sum())
        if oob:
            range_issues["maintenance_score (1..10)"] = oob
    if "fog_risk_score" in df.columns:
        v = pd.to_numeric(df["fog_risk_score"], errors="coerce")
        oob = int(((v < 0) | (v > 1) & v.notna()).sum())
        if oob:
            range_issues["fog_risk_score (0..1)"] = oob
    if range_issues:
        validation["range_issues"] = range_issues

    # ---- 6. Journey date -> datetime ----
    dates = pd.to_datetime(df["journey_date"], errors="coerce")
    invalid_date_mask = dates.isna()
    validation["invalid_dates"] = int(invalid_date_mask.sum())
    df["journey_date"] = dates

    # ---- 7. Target validation (impossible = non-numeric / negative) ----
    target_num = pd.to_numeric(df[TARGET], errors="coerce")
    invalid_target_mask = df[TARGET].notna() & target_num.isna()
    negative_mask = target_num < 0
    validation["negative_targets"] = int(negative_mask.sum())
    validation["non_numeric_targets"] = int(invalid_target_mask.sum())

    drop_mask = invalid_target_mask | negative_mask | invalid_date_mask
    invalid_rows_removed = int(drop_mask.sum())
    df = df[~drop_mask].reset_index(drop=True)
    report["invalid_rows_removed"] = invalid_rows_removed

    # ---- 8. Normalise train_number to string ----
    df["train_number"] = df["train_number"].astype(str).str.strip()

    # ---- 9. Missing values after ----
    miss_after = {str(c): int(v) for c, v in df.isna().sum().items() if v > 0}
    report["missing_values_after"] = int(sum(miss_after.values()))
    if miss_after:
        validation["missing_after_by_column"] = miss_after

    # ---- 10. Target statistics (extreme delays flagged, not removed) ----
    tv = df[TARGET].astype(float)
    extreme_mask = tv >= args.extreme_minutes
    report["target_statistics"] = {
        "min": float(tv.min()),
        "max": float(tv.max()),
        "mean": round(float(tv.mean()), 2),
        "median": float(tv.median()),
        "std": round(float(tv.std()), 2),
        "count_zero": int((tv == 0).sum()),
        "count_negative": int((tv < 0).sum()),
        "extreme_threshold_minutes": args.extreme_minutes,
        "count_extreme_delays": int(extreme_mask.sum()),
        "percent_extreme": round(float(extreme_mask.mean()) * 100, 4),
        "p95": float(np.percentile(tv, 95)),
        "p99": float(np.percentile(tv, 99)),
    }

    report["validation"] = validation
    report["final_rows"] = int(len(df))
    report["final_columns"] = int(len(df.columns))
    report["final_column_list"] = list(df.columns)

    # ---- 11. Save artifacts ----
    output_files = []
    df.to_parquet(CLEAN_PARQUET_FILE, index=False)
    output_files.append({
        "path": str(CLEAN_PARQUET_FILE),
        "rows": int(len(df)),
        "columns": int(len(df.columns)),
        "size_bytes": size_bytes(CLEAN_PARQUET_FILE),
    })

    if not args.no_csv:
        df.to_csv(CLEAN_CSV_FILE, index=False)
        output_files.append({
            "path": str(CLEAN_CSV_FILE),
            "rows": int(len(df)),
            "columns": int(len(df.columns)),
            "size_bytes": size_bytes(CLEAN_CSV_FILE),
        })

    report["output_files"] = output_files

    REPORT_FILE.write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")

    # ---- 12. Console summary ----
    print("=" * 64)
    print("RAILBUDDY REAL-DATA CLEANING — SUMMARY")
    print("=" * 64)
    print(f"source            : {report['source_file']}")
    print(f"original rows     : {report['original_rows']:,}  columns: {report['original_columns']}")
    print(f"duplicates removed: {report['duplicates_removed']:,}")
    print(f"invalid rows      : {report['invalid_rows_removed']:,}  "
          f"(negative/non-numeric target, bad dates)")
    print(f"missing before    : {report['missing_values_before']:,}")
    print(f"final rows        : {report['final_rows']:,}  columns: {report['final_columns']}")
    print(f"removed columns   : {', '.join(report['removed_columns'])}")
    ts = report["target_statistics"]
    print(f"target  min={ts['min']} max={ts['max']} mean={ts['mean']} "
          f"median={ts['median']} std={ts['std']}")
    print(f"extreme (>= {ts['extreme_threshold_minutes']} min): "
          f"{ts['count_extreme_delays']:,} ({ts['percent_extreme']}%) — flagged, NOT removed")
    print(f"parquet           : {CLEAN_PARQUET_FILE}")
    print(f"report            : {REPORT_FILE}")
    print("=" * 64)


if __name__ == "__main__":
    main()