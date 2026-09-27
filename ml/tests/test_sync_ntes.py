"""
Tests for the NTES -> MongoDB mapping in scripts/sync_ntes.py.

Runs on the standard library only::

    cd ml && python -m unittest discover -s tests -v

The fixtures reproduce the REAL NTES payloads captured live on 2026-09-26 for
train 12951 (NDLS TEJAS RAJ), so the field names, types and quirks under test
are the ones the provider actually sends - including the surprises: STA is an
empty string at the origin, Distance and Halt arrive as strings, and the
timetable carries 76 near-identical valid start dates.
"""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

from sync_ntes import (  # noqa: E402
    build_schedule_doc,
    build_train_doc,
    clean_text,
    database_name_from_uri,
    normalize_station_code,
    normalize_train_number,
    to_float,
    to_int,
)

# --- Real NTES payloads (verbatim shapes) -----------------------------------

REAL_TRAIN_INFO = {
    "TrainNameHindi": "तेजस राजधानि",
    "DstnNameHindi": "नई दिल्ली",
    "AlertMsgHindi": "",
    "TrainNo": "12951",
    "TrainName": "NDLS TEJAS RAJ",
    "Src": "MMCT",
    "DstnName": "NEW DELHI",
    "AlertMsg": "",
    "SrcNameHindi": "मुम्बई सेन्ट्रल",
    "Dstn": "NDLS",
    "SrcName": "MUMBAI CENTRAL",
    "vInstanceList": [
        {"excpMsg": "", "trainStatus": 0, "trainPosition": "Yet to start from its source", "startDate": "27-Sep-2026"}
    ],
}

REAL_SCHEDULE = {
    "Destination": "NDLS",
    "TrainName": "NDLS TEJAS RAJ",
    "TrainTypeDescHindi": "राजधानी",
    "AlertMsg": "",
    "DestinationHindiName": "नई दिल्ली",
    "SourceHindiName": "मुम्बई सेन्ट्रल",
    "Source": "MMCT",
    "utsClassOfTravel": "",
    "utsFareCategory": "",
    "TravelTime": "15:32",
    "AlertMsgHindi": "",
    "TrainHindiName": "तेजस राजधानि",
    "DestinationName": "NEW DELHI",
    "ValidFrom": "19-Aug-2026",
    "TrainType": "RAJ",
    "TrainNumber": "12951",
    "utsTrainFlag": 0,
    "SourceName": "MUMBAI CENTRAL",
    "DaysOfRun": "Daily",
    "ClassOfTravel": "1A,2A,3A",
    "utsMstAllowed": 0,
    "prsClassOfTravel": "1A,2A,3A",
    "TrainTypeDesc": "RAJDHANI",
    "FutureFlag": 0,
    "startDate": "26-Sep-2026",
    "Reserved": 0,
    "utsFareCategoryDesc": "",
    "vStartDateList": [f"{d:02d}-Sep-2026" for d in range(11, 31)]
    + [f"{d:02d}-Oct-2026" for d in range(1, 27)],
    "stations": [
        {
            "StationName": "MUMBAI CENTRAL",
            "STA": "",
            "STD": "17:00",
            "Halt": 0,
            "StationHindiName": "मुम्बई सेन्ट्रल",
            "DayOfRun": "Daily",
            "ArrDepFlag": False,
            "Reversal": 0,
            "StationCode": "MMCT",
            "Day": 1,
            "Distance": "0",
            "Sr": 1,
        },
        {
            "StationName": "BORIVALI",
            "STA": "17:20",
            "STD": "17:22",
            "Halt": 2,
            "StationHindiName": "बोरिवली",
            "DayOfRun": "Daily",
            "ArrDepFlag": False,
            "Reversal": 0,
            "StationCode": "BVI",
            "Day": 1,
            "Distance": "30",
            "Sr": 2,
        },
        {
            "StationName": "SURAT",
            "STA": "19:43",
            "STD": "19:48",
            "Halt": 5,
            "StationHindiName": "सूरत",
            "DayOfRun": "Daily",
            "ArrDepFlag": False,
            "Reversal": 0,
            "StationCode": "ST",
            "Day": 1,
            "Distance": "262",
            "Sr": 3,
        },
    ],
}


class TestNormalizeTrainNumber(unittest.TestCase):
    def test_accepts_real_numbers(self):
        for value, expected in [
            ("12951", "12951"),
            ("22436", "22436"),
            ("10103", "10103"),
            ("  12951  ", "12951"),
            (12951, "12951"),
            ("12951A", "12951"),
        ]:
            self.assertEqual(normalize_train_number(value), expected, f"{value!r} should normalize")

    def test_rejects_out_of_range(self):
        for value in ("", "123", "1234567", "abcd", None, "   "):
            self.assertIsNone(normalize_train_number(value), f"{value!r} should be rejected")


class TestNormalizeStationCode(unittest.TestCase):
    def test_accepts_real_codes(self):
        for code in ("NDLS", "MMCT", "BVI", "ST", "HWH"):
            self.assertEqual(normalize_station_code(code), code)

    def test_uppercases_and_strips(self):
        self.assertEqual(normalize_station_code(" ndls "), "NDLS")
        self.assertEqual(normalize_station_code("N D L S"), "NDLS")

    def test_rejects_malformed(self):
        for bad in ("", "1", "TOOLONGCODE", "N/L", None, "-NDLS"):
            self.assertIsNone(normalize_station_code(bad), f"{bad!r} should be rejected")


class TestScalars(unittest.TestCase):
    def test_clean_text_collapses_whitespace(self):
        self.assertEqual(clean_text("  NEW    DELHI "), "NEW DELHI")
        self.assertIsNone(clean_text(""))
        self.assertIsNone(clean_text("   "))
        self.assertIsNone(clean_text(None))

    def test_to_float_handles_ntes_strings(self):
        self.assertEqual(to_float("262"), 262.0)
        self.assertEqual(to_float(30), 30.0)
        self.assertIsNone(to_float(""))
        self.assertIsNone(to_float("n/a"))
        self.assertIsNone(to_float(None))

    def test_to_int_handles_ntes_values(self):
        self.assertEqual(to_int("5"), 5)
        self.assertEqual(to_int(0), 0)
        self.assertIsNone(to_int(""))
        self.assertIsNone(to_int(None))


class TestBuildTrainDoc(unittest.TestCase):
    def test_maps_real_train_info(self):
        doc = build_train_doc(
            "12951",
            name=REAL_TRAIN_INFO["TrainName"],
            name_hindi=REAL_TRAIN_INFO["TrainNameHindi"],
            source_code=REAL_TRAIN_INFO["Src"],
            source_name=REAL_TRAIN_INFO["SrcName"],
            destination_code=REAL_TRAIN_INFO["Dstn"],
            destination_name=REAL_TRAIN_INFO["DstnName"],
        )
        self.assertEqual(doc["number"], "12951")
        self.assertEqual(doc["name"], "NDLS TEJAS RAJ")
        self.assertEqual(doc["source_code"], "MMCT")
        self.assertEqual(doc["destination_code"], "NDLS")
        self.assertEqual(doc["name_hindi"], "तेजस राजधानि")
        self.assertEqual(doc["source"], "ntes:train_info")

    def test_omits_fields_ntes_did_not_supply(self):
        """Absent keys (not None) so a later thin upsert cannot blank them."""
        doc = build_train_doc("12951", name="NDLS TEJAS RAJ")
        for field in ("type", "days_of_run", "travel_time", "class_of_travel", "valid_from"):
            self.assertNotIn(field, doc, f"{field} must be absent, not null")

    def test_drops_empty_strings(self):
        doc = build_train_doc("12951", name="NDLS TEJAS RAJ", days_of_run="", train_type="   ")
        self.assertNotIn("days_of_run", doc)
        self.assertNotIn("type", doc)

    def test_rejects_malformed_number(self):
        self.assertIsNone(build_train_doc("12"))
        self.assertIsNone(build_train_doc("abcdef"))
        self.assertIsNone(build_train_doc(None))


class TestBuildScheduleDoc(unittest.TestCase):
    def test_maps_real_schedule(self):
        doc = build_schedule_doc("12951", REAL_SCHEDULE)
        self.assertEqual(doc["train_number"], "12951")
        self.assertEqual(doc["train_name"], "NDLS TEJAS RAJ")
        self.assertEqual(doc["source_code"], "MMCT")
        self.assertEqual(doc["destination_code"], "NDLS")
        self.assertEqual(doc["days_of_run"], "Daily")
        self.assertEqual(doc["travel_time"], "15:32")
        self.assertEqual(doc["class_of_travel"], "1A,2A,3A")
        self.assertEqual(doc["stop_count"], 3)
        self.assertEqual(doc["source"], "ntes:schedule")

    def test_stops_are_ordered_and_typed(self):
        doc = build_schedule_doc("12951", REAL_SCHEDULE)
        stops = doc["stops"]
        self.assertEqual([s["sequence"] for s in stops], [1, 2, 3])
        self.assertEqual([s["code"] for s in stops], ["MMCT", "BVI", "ST"])
        # NTES sends Distance/Halt as strings; they must become numbers.
        self.assertEqual(stops[1]["distance_km"], 30.0)
        self.assertEqual(stops[1]["halt_minutes"], 2)
        self.assertEqual(stops[2]["distance_km"], 262.0)

    def test_origin_has_no_arrival_time(self):
        """STA is an empty string at the origin - it must become None, not ''."""
        doc = build_schedule_doc("12951", REAL_SCHEDULE)
        self.assertIsNone(doc["stops"][0]["arrival"])
        self.assertEqual(doc["stops"][0]["departure"], "17:00")
        self.assertEqual(doc["stops"][1]["arrival"], "17:20")
        self.assertEqual(doc["stops"][1]["departure"], "17:22")

    def test_total_distance_uses_the_farthest_stop(self):
        doc = build_schedule_doc("12951", REAL_SCHEDULE)
        self.assertEqual(doc["total_distance_km"], 262.0)

    def test_valid_dates_are_summarised_not_stored_verbatim(self):
        """76 near-identical dates collapse to a count and a window."""
        doc = build_schedule_doc("12951", REAL_SCHEDULE)
        self.assertEqual(doc["valid_start_date_count"], len(REAL_SCHEDULE["vStartDateList"]))
        self.assertEqual(doc["valid_start_date_from"], "11-Sep-2026")
        self.assertNotIn("valid_start_dates", doc)

    def test_refuses_to_invent_an_empty_timetable(self):
        self.assertIsNone(build_schedule_doc("12951", {"stations": []}))
        self.assertIsNone(build_schedule_doc("12951", {}))
        self.assertIsNone(build_schedule_doc("12951", {"TrainNumber": "12951"}))

    def test_skips_unusable_stops_but_keeps_the_rest(self):
        schedule = dict(REAL_SCHEDULE)
        schedule["stations"] = [
            {"StationCode": "", "StationName": ""},  # unusable
            {"StationCode": "ndls", "StationName": " NEW  DELHI ", "Sr": 2},
        ]
        doc = build_schedule_doc("12951", schedule)
        self.assertEqual(doc["stop_count"], 1)
        self.assertEqual(doc["stops"][0]["code"], "NDLS")
        self.assertEqual(doc["stops"][0]["name"], "NEW DELHI")

    def test_falls_back_to_position_when_sr_is_missing(self):
        schedule = dict(REAL_SCHEDULE)
        schedule["stations"] = [{"StationCode": "NDLS", "StationName": "NEW DELHI"}]
        doc = build_schedule_doc("12951", schedule)
        self.assertEqual(doc["stops"][0]["sequence"], 1)

    def test_rejects_malformed_train_number(self):
        self.assertIsNone(build_schedule_doc("1", REAL_SCHEDULE))


class TestDatabaseNameFromUri(unittest.TestCase):
    def test_reads_database_from_path(self):
        self.assertEqual(database_name_from_uri("mongodb://127.0.0.1:27017/railbuddy"), "railbuddy")
        self.assertEqual(
            database_name_from_uri("mongodb+srv://u:p@cluster.mongodb.net/railbuddy?retryWrites=true&w=majority"),
            "railbuddy",
        )
        self.assertEqual(database_name_from_uri("mongodb+srv://u:p@cluster.mongodb.net/prod_db"), "prod_db")

    def test_falls_back_when_absent(self):
        self.assertEqual(database_name_from_uri("mongodb://127.0.0.1:27017"), "railbuddy")
        self.assertEqual(database_name_from_uri("mongodb+srv://u:p@cluster.mongodb.net"), "railbuddy")
        self.assertEqual(database_name_from_uri(""), "railbuddy")

    def test_credentials_containing_slash_are_not_mistaken_for_the_path(self):
        self.assertEqual(
            database_name_from_uri("mongodb+srv://user:p%40ss%2Fword@cluster.mongodb.net/railbuddy?w=majority"),
            "railbuddy",
        )


if __name__ == "__main__":
    unittest.main(verbosity=2)
