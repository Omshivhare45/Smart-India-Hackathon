#!/usr/bin/env python3
"""
RailBuddy train + schedule sync (NTES -> MongoDB).

Fills the two collections that RailRadar's bulk directories cannot provide:

    trains     route/type/days-of-run enrichment for train numbers that are
               already in the catalogue (populated by
               `node backend/scripts/sync-catalog.mjs`)
    schedules  the full timetable for a train, stops embedded in one document

Why a separate script: the NTES client is Python-only (``ntes-client``, already
pinned in ml/requirements.txt and used by the ML service), while the catalogue
API and the RailRadar sync live in the Node backend.

Source: the documented public NTES methods, verified live on 2026-09-26::

    client.search(q)       -> {"Trains": [{TrainNumber, TrainName, Type,
                             Source, SourceName, Destination, DestinationName,
                             + *Hindi variants}], ...}
    client.train_info(n)   -> {TrainNo, TrainName, Src, SrcName, Dstn,
                             DstnName, vInstanceList, + Hindi}
    client.schedule(n)     -> {TrainNumber, TrainName, TrainType, TrainTypeDesc,
                             Source, SourceName, Destination, DestinationName,
                             DaysOfRun, TravelTime, ValidFrom, vStartDateList,
                             "stations": [{StationCode, StationName, STA, STD,
                             Halt, Distance, Day, Sr, ...}]}

Nothing is invented. If NTES returns no ``stations`` for a train, no schedule
document is written - the train simply has no schedule in the database, and the
API reports that honestly.

Usage (from the repository root)::

    python ml/scripts/sync_ntes.py --limit 200
    python ml/scripts/sync_ntes.py --trains 12951 22436 12951   # specific
    python ml/scripts/sync_ntes.py --limit 50 --dry-run
    python ml/scripts/sync_ntes.py --discover "rajdhani" --limit 30

Environment:
    MONGODB_URI   required (falls back to mongodb://127.0.0.1:27017/railbuddy)
"""

from __future__ import annotations

import argparse
import os
import random
import re
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable

try:
    from ntes import NTESClient
except ImportError:  # pragma: no cover
    sys.exit("ntes-client is not installed. Run: pip install -r ml/requirements.txt")

try:
    from pymongo import MongoClient
    from pymongo.errors import PyMongoError
except ImportError:  # pragma: no cover
    sys.exit("pymongo is not installed. Run: pip install pymongo")


DEFAULT_URI = "mongodb://127.0.0.1:27017/railbuddy"
COLLECTION_TRAINS = "trains"
COLLECTION_SCHEDULES = "schedules"
COLLECTION_SYNC_LOGS = "sync_logs"

TRAIN_NUMBER_RE = re.compile(r"^\d{4,6}$")
STATION_CODE_RE = re.compile(r"^[A-Z][A-Z0-9]{1,4}$")

# Politeness delay between NTES calls. NTES is a public, rate-limited Indian
# Railways endpoint; the sync stays well under any plausible limit.
REQUEST_DELAY_SECONDS = 0.4


# ---------------------------------------------------------------------------
# Normalization (mirrors backend/src/lib/catalogStore.js)
# ---------------------------------------------------------------------------

def normalize_train_number(value: Any) -> str | None:
    """Digits only, 4-6 of them, or None."""
    if value is None:
        return None
    digits = re.sub(r"[^0-9]", "", str(value))
    return digits if TRAIN_NUMBER_RE.match(digits) else None


def normalize_station_code(value: Any) -> str | None:
    """UPPERCASE 2-5 char station code, or None."""
    if value is None:
        return None
    code = re.sub(r"\s+", "", str(value)).upper()
    return code if STATION_CODE_RE.match(code) else None


def clean_text(value: Any) -> str | None:
    """Trim and collapse whitespace; empty becomes None."""
    if value is None:
        return None
    text = re.sub(r"\s+", " ", str(value)).strip()
    return text or None


def to_float(value: Any) -> float | None:
    try:
        if value is None or value == "":
            return None
        return float(value)
    except (TypeError, ValueError):
        return None


def to_int(value: Any) -> int | None:
    try:
        if value is None or value == "":
            return None
        return int(value)
    except (TypeError, ValueError):
        return None


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


# ---------------------------------------------------------------------------
# Mapping
# ---------------------------------------------------------------------------

def build_train_doc(
    number: str,
    *,
    name: str | None = None,
    name_hindi: str | None = None,
    train_type: str | None = None,
    type_desc: str | None = None,
    source_code: str | None = None,
    source_name: str | None = None,
    source_name_hindi: str | None = None,
    destination_code: str | None = None,
    destination_name: str | None = None,
    destination_name_hindi: str | None = None,
    days_of_run: str | None = None,
    travel_time: str | None = None,
    class_of_travel: str | None = None,
    valid_from: str | None = None,
) -> dict[str, Any] | None:
    """Assemble a trains document, or None when the number is unusable.

    Only fields NTES actually returned are set; the rest stay absent so a later
    $set upsert from a thinner source cannot blank them out.
    """
    normalized = normalize_train_number(number)
    if not normalized:
        return None

    doc: dict[str, Any] = {"number": normalized, "source": "ntes:train_info"}

    optional = {
        "name": clean_text(name),
        "name_hindi": clean_text(name_hindi),
        "type": clean_text(train_type),
        "type_desc": clean_text(type_desc),
        "source_code": normalize_station_code(source_code),
        "source_name": clean_text(source_name),
        "source_name_hindi": clean_text(source_name_hindi),
        "destination_code": normalize_station_code(destination_code),
        "destination_name": clean_text(destination_name),
        "destination_name_hindi": clean_text(destination_name_hindi),
        "days_of_run": clean_text(days_of_run),
        "travel_time": clean_text(travel_time),
        "class_of_travel": clean_text(class_of_travel),
        "valid_from": clean_text(valid_from),
    }
    for key, value in optional.items():
        if value is not None:
            doc[key] = value
    return doc


def build_schedule_doc(number: str, schedule: dict[str, Any]) -> dict[str, Any] | None:
    """Assemble a schedules document, or None when there is no real timetable.

    Requires at least one usable stop: a schedule with zero stations is treated
    as "no data from NTES" rather than an empty timetable.
    """
    normalized = normalize_train_number(number)
    if not normalized:
        return None

    raw_stations = schedule.get("stations") or []
    stops: list[dict[str, Any]] = []
    for index, raw in enumerate(raw_stations, start=1):
        if not isinstance(raw, dict):
            continue
        code = normalize_station_code(raw.get("StationCode"))
        name = clean_text(raw.get("StationName"))
        if not code and not name:
            continue

        stops.append(
            {
                "sequence": to_int(raw.get("Sr")) or index,
                "code": code,
                "name": name,
                "name_hindi": clean_text(raw.get("StationHindiName")),
                "arrival": clean_text(raw.get("STA")),
                "departure": clean_text(raw.get("STD")),
                "halt_minutes": to_int(raw.get("Halt")),
                "distance_km": to_float(raw.get("Distance")),
                "day": to_int(raw.get("Day")),
                "day_of_run": clean_text(raw.get("DayOfRun")),
                "is_origin": bool(raw.get("ArrDepFlag") is False and index == 1),
                "reversal": to_int(raw.get("Reversal")),
            }
        )

    if not stops:
        return None

    distances = [s["distance_km"] for s in stops if s["distance_km"] is not None]
    valid_dates = [d for d in (schedule.get("vStartDateList") or []) if isinstance(d, str) and d.strip()]

    doc: dict[str, Any] = {
        "train_number": normalized,
        "train_name": clean_text(schedule.get("TrainName")),
        "train_name_hindi": clean_text(schedule.get("TrainHindiName")),
        "type": clean_text(schedule.get("TrainType")),
        "type_desc": clean_text(schedule.get("TrainTypeDesc")),
        "source_code": normalize_station_code(schedule.get("Source")),
        "source_name": clean_text(schedule.get("SourceName")),
        "destination_code": normalize_station_code(schedule.get("Destination")),
        "destination_name": clean_text(schedule.get("DestinationName")),
        "days_of_run": clean_text(schedule.get("DaysOfRun")),
        "travel_time": clean_text(schedule.get("TravelTime")),
        "class_of_travel": clean_text(schedule.get("ClassOfTravel")),
        "valid_from": clean_text(schedule.get("ValidFrom")),
        "start_date": clean_text(schedule.get("startDate")),
        "total_distance_km": max(distances) if distances else None,
        "stop_count": len(stops),
        "stops": stops,
        "source": "ntes:schedule",
    }
    if valid_dates:
        # NTES returns one date per calendar day over the published horizon.
        # Storing 76 near-identical strings per train buys nothing; the count and
        # the window are enough to answer "does it run that day".
        doc["valid_start_date_count"] = len(valid_dates)
        doc["valid_start_date_from"] = valid_dates[0]
        doc["valid_start_date_to"] = valid_dates[-1]
    return doc


# ---------------------------------------------------------------------------
# Database
# ---------------------------------------------------------------------------

def database_name_from_uri(uri: str) -> str:
    without_query = uri.split("?")[0]
    after_scheme = re.sub(r"^mongodb(\+srv)?://", "", without_query, flags=re.IGNORECASE)
    after_host = after_scheme[after_scheme.find("@") + 1 :]
    if "/" not in after_host:
        return "railbuddy"
    name = after_host.split("/", 1)[1].strip("/")
    return name or "railbuddy"


def connect(uri: str):
    client = MongoClient(uri, serverSelectionTimeoutMS=8000)
    # Fail fast with a clear message instead of hanging on a bad URI.
    client.admin.command("ping")
    return client, client[database_name_from_uri(uri)]


# ---------------------------------------------------------------------------
# Train discovery
# ---------------------------------------------------------------------------

def numbers_from_catalogue(db, limit: int | None) -> list[str]:
    """Train numbers already in the `trains` collection (RailRadar catalogue)."""
    projection = {"_id": 0, "number": 1}
    cursor = db[COLLECTION_TRAINS].find({}, projection).sort("number", 1)
    if limit:
        cursor = cursor.limit(limit)
    return [normalize_train_number(d.get("number")) for d in cursor]


def numbers_from_search(client: NTESClient, query: str, limit: int) -> list[str]:
    """Train numbers matching a free-text NTES search."""
    result = client.search(query) or {}
    numbers: list[str] = []
    for train in result.get("Trains") or []:
        if not isinstance(train, dict):
            continue
        number = normalize_train_number(train.get("TrainNumber"))
        if number and number not in numbers:
            numbers.append(number)
        if len(numbers) >= limit:
            break
    return numbers


# ---------------------------------------------------------------------------
# Sync
# ---------------------------------------------------------------------------

def sync_train(
    ntes: NTESClient,
    db,
    number: str,
    *,
    dry_run: bool,
) -> dict[str, Any]:
    """Enrich one train document. Never overwrites with empty values."""
    info = ntes.train_info(number) or {}
    if not isinstance(info, dict) or not info:
        return {"number": number, "status": "skipped", "reason": "no train_info from NTES"}

    doc = build_train_doc(
        number,
        name=info.get("TrainName"),
        name_hindi=info.get("TrainNameHindi"),
        source_code=info.get("Src"),
        source_name=info.get("SrcName"),
        source_name_hindi=info.get("SrcNameHindi"),
        destination_code=info.get("Dstn"),
        destination_name=info.get("DstnName"),
        destination_name_hindi=info.get("DstnNameHindi"),
    )
    if not doc:
        return {"number": number, "status": "skipped", "reason": "malformed train number"}

    instances = info.get("vInstanceList") or []
    if instances and dry_run is False:
        # Kept as a count only; per-instance rows go stale within a day.
        doc["upcoming_run_count"] = len(instances)

    if not dry_run:
        db[COLLECTION_TRAINS].update_one({"number": doc["number"]}, {"$set": doc}, upsert=True)

    return {"number": doc["number"], "status": "ok", "name": doc.get("name")}


def sync_schedule(
    ntes: NTESClient,
    db,
    number: str,
    *,
    dry_run: bool,
) -> dict[str, Any]:
    """Write the full timetable for one train, stops embedded."""
    schedule = ntes.schedule(number) or {}
    if not isinstance(schedule, dict) or not schedule:
        return {"number": number, "status": "skipped", "reason": "no schedule from NTES"}

    doc = build_schedule_doc(number, schedule)
    if not doc:
        # NTES had no usable stop list. Record nothing rather than an empty one.
        return {"number": number, "status": "skipped", "reason": "NTES returned no usable stations"}

    if not dry_run:
        db[COLLECTION_SCHEDULES].update_one(
            {"train_number": doc["train_number"]}, {"$set": doc}, upsert=True
        )

    return {
        "number": doc["train_number"],
        "status": "ok",
        "stops": doc["stop_count"],
        "name": doc.get("train_name"),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Sync RailBuddy trains and schedules from NTES.")
    parser.add_argument("--limit", type=int, default=50, help="max trains to process (0 = all)")
    parser.add_argument("--trains", nargs="*", default=[], help="explicit train numbers to sync")
    parser.add_argument("--discover", metavar="QUERY", help="discover train numbers via NTES search")
    parser.add_argument("--no-schedule", action="store_true", help="only enrich trains, skip schedules")
    parser.add_argument("--dry-run", action="store_true", help="fetch and validate, write nothing")
    parser.add_argument("--shuffle", action="store_true", help="randomise order to spread NTES load")
    args = parser.parse_args()

    uri = os.environ.get("MONGODB_URI") or DEFAULT_URI
    limit = args.limit if args.limit and args.limit > 0 else None

    print(f"MongoDB URI        : {uri.split('@')[-1]}")
    print(f"Dry run            : {args.dry_run}")

    try:
        client, db = connect(uri)
    except PyMongoError as exc:
        print(f"Could not connect to MongoDB: {exc}")
        print("Set MONGODB_URI to a local mongod or a MongoDB Atlas SRV string.")
        return 1

    ntes = NTESClient(timeout=25, retries=1)

    # ---- resolve which trains to process ----
    numbers: list[str] = []
    if args.trains:
        numbers = [n for n in (normalize_train_number(t) for t in args.trains) if n]
    elif args.discover:
        print(f"Discovering trains via NTES search: {args.discover!r}")
        numbers = numbers_from_search(ntes, args.discover, limit or 50)
    else:
        numbers = [n for n in numbers_from_catalogue(db, limit) if n]

    if args.shuffle:
        random.shuffle(numbers)

    print(f"Trains to process  : {len(numbers)}")
    if not numbers:
        print("Nothing to do. Populate `trains` first with: node backend/scripts/sync-catalog.mjs")
        client.close()
        return 0

    # ---- run ----
    started = datetime.now(timezone.utc)
    train_results: list[dict[str, Any]] = []
    schedule_results: list[dict[str, Any]] = []
    errors: list[dict[str, Any]] = []

    for index, number in enumerate(numbers, start=1):
        try:
            train_results.append(sync_train(ntes, db, number, dry_run=args.dry_run))
        except Exception as exc:  # noqa: BLE001 - one bad train must not stop the run
            errors.append({"number": number, "stage": "train_info", "error": f"{type(exc).__name__}: {exc}"})

        if not args.no_schedule:
            try:
                schedule_results.append(sync_schedule(ntes, db, number, dry_run=args.dry_run))
            except Exception as exc:  # noqa: BLE001
                errors.append({"number": number, "stage": "schedule", "error": f"{type(exc).__name__}: {exc}"})

        if index % 10 == 0 or index == len(numbers):
            print(f"  {index}/{len(numbers)} processed")
        time.sleep(REQUEST_DELAY_SECONDS)

    # ---- audit trail ----
    counts = {
        "requested": len(numbers),
        "trains_ok": sum(1 for r in train_results if r["status"] == "ok"),
        "trains_skipped": sum(1 for r in train_results if r["status"] == "skipped"),
        "schedules_ok": sum(1 for r in schedule_results if r["status"] == "ok"),
        "schedules_skipped": sum(1 for r in schedule_results if r["status"] == "skipped"),
        "errors": len(errors),
    }
    if not args.dry_run:
        status = "success" if not errors else "partial"
        db[COLLECTION_SYNC_LOGS].insert_one(
            {
                "job": "ntes-trains-schedules",
                "trigger": "cli",
                "status": status,
                "started_at": started,
                "finished_at": datetime.now(timezone.utc),
                "duration_ms": int((datetime.now(timezone.utc) - started).total_seconds() * 1000),
                "counts": counts,
                "error": None if not errors else {"message": f"{len(errors)} train(s) failed"},
                "warnings": [f"{n}: no schedule from NTES" for n, r in zip(numbers, schedule_results) if r.get("status") == "skipped"][:20],
                "meta": {"dry_run": args.dry_run, "discover": args.discover},
            }
        )

    print("\n── NTES Sync Summary " + "─" * 40)
    for key, value in counts.items():
        print(f"  {key:<20}: {value}")
    if errors:
        print("\n  Errors (first 10):")
        for err in errors[:10]:
            print(f"    {err['number']} [{err['stage']}]: {err['error']}")
    if not args.dry_run:
        print(f"\n  trains    in db: {db[COLLECTION_TRAINS].count_documents({}):,}")
        print(f"  schedules in db: {db[COLLECTION_SCHEDULES].count_documents({}):,}")
    print("─" * 60)

    client.close()
    return 0 if not errors else 1


if __name__ == "__main__":
    sys.exit(main())
