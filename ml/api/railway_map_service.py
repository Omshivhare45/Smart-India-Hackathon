"""
RailwayMapService: Live railway tracking & map data provider abstraction for RailBuddy.

Architectural Flow:
  Frontend (MapLibre GL) -> FastAPI (/api/map/*) -> RailwayMapService -> Upstream RailRadar API
                                                                     -> Fallback Demo Provider
"""

from __future__ import annotations

import math
import os
import threading
import time
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

import requests

# Resolve environment variables from ml/.env or backend/.env
def _load_env_file(path: Path) -> None:
    if not path.is_file():
        return
    try:
        for line in path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            k, v = k.strip(), v.strip()
            if k and k not in os.environ:
                os.environ[k] = v
    except Exception:
        pass

_ML_DIR = Path(__file__).resolve().parents[1]
_BACKEND_DIR = _ML_DIR.parent / "backend"
_load_env_file(_ML_DIR / ".env")
_load_env_file(_BACKEND_DIR / ".env")

RAILRADAR_API_KEY = os.getenv("RAILRADAR_API_KEY", "")
RAILRADAR_BASE_URL = os.getenv("RAILRADAR_BASE_URL", "https://api.railradar.in/v1").rstrip("/")
RAILRADAR_PROXY_URL = os.getenv("RAILRADAR_PROXY_URL", "http://localhost:4000").rstrip("/")
DATA_MODE = os.getenv("DATA_MODE", "AUTO").upper()  # REALTIME, HYBRID_REALTIME, DEMO, AUTO

# -----------------------------------------------------------------------------
# Helpers: Bearing & Distance calculations
# -----------------------------------------------------------------------------
def calculate_bearing(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate compass heading in degrees from point 1 to point 2."""
    try:
        phi1 = math.radians(lat1)
        phi2 = math.radians(lat2)
        delta_lambda = math.radians(lon2 - lon1)
        y = math.sin(delta_lambda) * math.cos(phi2)
        x = math.cos(phi1) * math.sin(phi2) - math.sin(phi1) * math.cos(phi2) * math.cos(delta_lambda)
        theta = math.atan2(y, x)
        bearing = (math.degrees(theta) + 360.0) % 360.0
        return round(bearing, 1)
    except Exception:
        return 0.0


def calculate_distance_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Haversine distance in km."""
    try:
        r = 6371.0
        d_lat = math.radians(lat2 - lat1)
        d_lon = math.radians(lon2 - lon1)
        a = (math.sin(d_lat / 2.0) ** 2 +
             math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(d_lon / 2.0) ** 2)
        c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
        return round(r * c, 2)
    except Exception:
        return 0.0


# -----------------------------------------------------------------------------
# Curated Indian Railway Stations Reference (Coordinates & Codes)
# -----------------------------------------------------------------------------
CORE_STATIONS: Dict[str, Dict[str, Any]] = {
    "NDLS": {"code": "NDLS", "name": "New Delhi", "lat": 28.64177, "lng": 77.22027, "zone": "NR", "platforms": 16},
    "CNB": {"code": "CNB", "name": "Kanpur Central", "lat": 26.4542, "lng": 80.3507, "zone": "NCR", "platforms": 10},
    "PRYJ": {"code": "PRYJ", "name": "Prayagraj Jn", "lat": 25.4484, "lng": 81.8340, "zone": "NCR", "platforms": 10},
    "BSB": {"code": "BSB", "name": "Varanasi Jn", "lat": 25.32701, "lng": 82.9860, "zone": "NR", "platforms": 9},
    "BPL": {"code": "BPL", "name": "Bhopal Jn", "lat": 23.2599, "lng": 77.4126, "zone": "WCR", "platforms": 6},
    "RKMP": {"code": "RKMP", "name": "Rani Kamlapati", "lat": 23.2081, "lng": 77.4372, "zone": "WCR", "platforms": 5},
    "GWL": {"code": "GWL", "name": "Gwalior Jn", "lat": 26.2163, "lng": 78.1884, "zone": "NCR", "platforms": 5},
    "AGC": {"code": "AGC", "name": "Agra Cantt", "lat": 27.1593, "lng": 78.0064, "zone": "NCR", "platforms": 6},
    "MMCT": {"code": "MMCT", "name": "Mumbai Central", "lat": 18.9696, "lng": 72.8193, "zone": "WR", "platforms": 8},
    "CSMT": {"code": "CSMT", "name": "Chhatrapati Shivaji Maharaj Terminus", "lat": 18.9402, "lng": 72.8356, "zone": "CR", "platforms": 18},
    "ST": {"code": "ST", "name": "Surat", "lat": 21.2052, "lng": 72.8407, "zone": "WR", "platforms": 4},
    "BRC": {"code": "BRC", "name": "Vadodara Jn", "lat": 22.3107, "lng": 73.1812, "zone": "WR", "platforms": 7},
    "ADI": {"code": "ADI", "name": "Ahmedabad Jn", "lat": 23.0238, "lng": 72.6009, "zone": "WR", "platforms": 12},
    "HWH": {"code": "HWH", "name": "Howrah Jn", "lat": 22.5839, "lng": 88.3434, "zone": "ER", "platforms": 23},
    "SDAH": {"code": "SDAH", "name": "Sealdah", "lat": 22.5675, "lng": 88.3712, "zone": "ER", "platforms": 21},
    "PNBE": {"code": "PNBE", "name": "Patna Jn", "lat": 25.6022, "lng": 85.1376, "zone": "ECR", "platforms": 10},
    "DDU": {"code": "DDU", "name": "Pt Deen Dayal Upadhyaya Jn", "lat": 25.2796, "lng": 83.1189, "zone": "ECR", "platforms": 8},
    "MAS": {"code": "MAS", "name": "MGR Chennai Central", "lat": 13.0827, "lng": 80.2755, "zone": "SR", "platforms": 17},
    "SBC": {"code": "SBC", "name": "KSR Bengaluru", "lat": 12.9781, "lng": 77.5696, "zone": "SWR", "platforms": 10},
    "SC": {"code": "SC", "name": "Secunderabad Jn", "lat": 17.4334, "lng": 78.5015, "zone": "SCR", "platforms": 10},
    "JP": {"code": "JP", "name": "Jaipur Jn", "lat": 26.9208, "lng": 75.7873, "zone": "NWR", "platforms": 8},
    "LKO": {"code": "LKO", "name": "Lucknow Charbagh", "lat": 26.8322, "lng": 80.9221, "zone": "NR", "platforms": 9},
    "GKP": {"code": "GKP", "name": "Gorakhpur Jn", "lat": 26.7588, "lng": 83.3857, "zone": "NER", "platforms": 10},
    "ASR": {"code": "ASR", "name": "Amritsar Jn", "lat": 31.6340, "lng": 74.8723, "zone": "NR", "platforms": 6},
    "CDG": {"code": "CDG", "name": "Chandigarh Jn", "lat": 30.7046, "lng": 76.8223, "zone": "NR", "platforms": 6},
    "JAT": {"code": "JAT", "name": "Jammu Tawi", "lat": 32.7060, "lng": 74.8800, "zone": "NR", "platforms": 4},
}

# Stations rendered as prominent hubs on the map (stronger markers, earlier labels)
MAJOR_STATIONS = {
    "NDLS", "MMCT", "CSMT", "HWH", "SDAH", "MAS", "SBC", "ADI", "PNBE",
    "CNB", "PRYJ", "BSB", "LKO", "JP", "SC", "GKP",
}


# -----------------------------------------------------------------------------
# Curated Demo Trains (Used when upstream is unavailable or in DEMO mode)
# -----------------------------------------------------------------------------
DEMO_TRAINS_DATA: List[Dict[str, Any]] = [
    {
        "train_number": "22436",
        "train_name": "New Delhi - Varanasi Vande Bharat Express",
        "type": "Vande Bharat",
        "current_lat": 26.8250,
        "current_lng": 80.8950,
        "next_lat": 26.4542,
        "next_lng": 80.3507,
        "speed": 115,
        "delay_minutes": 6,
        "current_station": "CNB",
        "current_station_name": "Kanpur Central Approach",
        "next_station": "PRYJ",
        "next_station_name": "Prayagraj Jn",
        "mins_since_dep": 240,
        "departure_minutes": 360,
        "next_arrival_minutes": 420,
        "curr_distance": 435.0,
        "next_distance": 630.0,
    },
    {
        "train_number": "12002",
        "train_name": "New Delhi - Rani Kamlapati Shatabdi Express",
        "type": "Shatabdi Express",
        "current_lat": 26.2163,
        "current_lng": 78.1884,
        "next_lat": 25.4484,
        "next_lng": 78.5685,
        "speed": 105,
        "delay_minutes": 3,
        "current_station": "GWL",
        "current_station_name": "Gwalior Junction",
        "next_station": "VGLJ",
        "next_station_name": "V Lakshmibai Jhansi",
        "mins_since_dep": 210,
        "departure_minutes": 360,
        "next_arrival_minutes": 430,
        "curr_distance": 319.0,
        "next_distance": 417.0,
    },
    {
        "train_number": "12952",
        "train_name": "New Delhi - Mumbai Central Tejas Rajdhani",
        "type": "Rajdhani Express",
        "current_lat": 22.3107,
        "current_lng": 73.1812,
        "next_lat": 21.2052,
        "next_lng": 72.8407,
        "speed": 120,
        "delay_minutes": 12,
        "current_station": "BRC",
        "current_station_name": "Vadodara Junction",
        "next_station": "ST",
        "next_station_name": "Surat",
        "mins_since_dep": 680,
        "departure_minutes": 1015,
        "next_arrival_minutes": 1105,
        "curr_distance": 992.0,
        "next_distance": 1122.0,
    },
    {
        "train_number": "12302",
        "train_name": "New Delhi - Howrah Rajdhani Express (via Gaya)",
        "type": "Rajdhani Express",
        "current_lat": 24.7955,
        "current_lng": 84.9994,
        "next_lat": 24.1800,
        "next_lng": 86.3000,
        "speed": 110,
        "delay_minutes": 18,
        "current_station": "GAYA",
        "current_station_name": "Gaya Junction",
        "next_station": "DHN",
        "next_station_name": "Dhanbad Junction",
        "mins_since_dep": 720,
        "departure_minutes": 1010,
        "next_arrival_minutes": 1140,
        "curr_distance": 995.0,
        "next_distance": 1195.0,
    },
    {
        "train_number": "12626",
        "train_name": "New Delhi - Thiruvananthapuram Kerala Express",
        "type": "Superfast Express",
        "current_lat": 21.1458,
        "current_lng": 79.0882,
        "next_lat": 20.9100,
        "next_lng": 77.7500,
        "speed": 85,
        "delay_minutes": 28,
        "current_station": "NGP",
        "current_station_name": "Nagpur Junction",
        "next_station": "SEGM",
        "next_station_name": "Sewagram Junction",
        "mins_since_dep": 840,
        "departure_minutes": 1210,
        "next_arrival_minutes": 1290,
        "curr_distance": 1094.0,
        "next_distance": 1170.0,
    },
    {
        "train_number": "12004",
        "train_name": "New Delhi - Lucknow Shatabdi Express",
        "type": "Shatabdi Express",
        "current_lat": 27.0200,
        "current_lng": 79.5200,
        "next_lat": 26.8322,
        "next_lng": 80.9221,
        "speed": 108,
        "delay_minutes": 4,
        "current_station": "ETW",
        "current_station_name": "Etawah Junction",
        "next_station": "LKO",
        "next_station_name": "Lucknow Charbagh",
        "mins_since_dep": 230,
        "departure_minutes": 370,
        "next_arrival_minutes": 435,
        "curr_distance": 320.0,
        "next_distance": 512.0,
    },
    {
        "train_number": "20608",
        "train_name": "Mysuru - MGR Chennai Central Vande Bharat Express",
        "type": "Vande Bharat",
        "current_lat": 12.9698,
        "current_lng": 79.1559,
        "next_lat": 13.0827,
        "next_lng": 80.2755,
        "speed": 112,
        "delay_minutes": 2,
        "current_station": "KPD",
        "current_station_name": "Katpadi Junction",
        "next_station": "MAS",
        "next_station_name": "MGR Chennai Central",
        "mins_since_dep": 260,
        "departure_minutes": 360,
        "next_arrival_minutes": 430,
        "curr_distance": 360.0,
        "next_distance": 496.0,
    },
    {
        "train_number": "12260",
        "train_name": "Bikaner - Sealdah AC Duronto Express",
        "type": "Duronto Express",
        "current_lat": 25.6022,
        "current_lng": 85.1376,
        "next_lat": 25.2796,
        "next_lng": 86.9800,
        "speed": 92,
        "delay_minutes": 22,
        "current_station": "PNBE",
        "current_station_name": "Patna Junction",
        "next_station": "MKA",
        "next_station_name": "Mokama",
        "mins_since_dep": 950,
        "departure_minutes": 740,
        "next_arrival_minutes": 830,
        "curr_distance": 1380.0,
        "next_distance": 1470.0,
    },
]


# -----------------------------------------------------------------------------
# RailwayMapService Class
# -----------------------------------------------------------------------------
class RailwayMapService:
    """
    Central service for railway map data, live train positions,
    track geometries, and RailBuddy ML ETA enrichment.
    """

    def __init__(self) -> None:
        self.api_key = RAILRADAR_API_KEY
        self.base_url = RAILRADAR_BASE_URL
        self.proxy_url = RAILRADAR_PROXY_URL
        self.data_mode = DATA_MODE

        # In-memory caches with thread-safe locks
        self._snapshot_cache: Optional[Dict[str, Any]] = None
        self._snapshot_cache_at: float = 0.0
        self._snapshot_ttl_seconds: float = 20.0
        self._snapshot_lock = threading.Lock()

        self._route_cache: Dict[str, Dict[str, Any]] = {}
        self._route_cache_lock = threading.Lock()

    def is_upstream_configured(self) -> bool:
        return bool(self.api_key and len(self.api_key.strip()) > 5)

    # ------------------------------------------------------------------
    # Route geometry extraction helpers
    # ------------------------------------------------------------------
    @staticmethod
    def _coords_valid(coords: Any) -> bool:
        """A usable polyline is >=2 pairs of numeric [lng, lat] values."""
        return (
            isinstance(coords, list)
            and len(coords) >= 2
            and all(
                isinstance(c, (list, tuple))
                and len(c) >= 2
                and isinstance(c[0], (int, float))
                and isinstance(c[1], (int, float))
                for c in coords[:10]
            )
        )

    @staticmethod
    def _coords_from_geojson(geojson: Any) -> List[List[float]]:
        """Pull [lng, lat] vertex pairs out of a GeoJSON payload.

        The upstream returns the track polyline under the ``geojson`` key as
        a Feature whose geometry is a LineString (or MultiLineString); the
        payload may also be a bare geometry or a FeatureCollection.
        """
        if not isinstance(geojson, dict):
            return []
        geom = None
        if geojson.get("type") == "Feature":
            geom = geojson.get("geometry")
        elif geojson.get("type") == "FeatureCollection":
            for f in geojson.get("features") or []:
                g = f.get("geometry") if isinstance(f, dict) else None
                if g and g.get("type") in ("LineString", "MultiLineString"):
                    geom = g
                    break
        elif geojson.get("type") in ("LineString", "MultiLineString"):
            geom = geojson
        if not isinstance(geom, dict):
            return []
        coords = geom.get("coordinates") or []
        if geom.get("type") == "MultiLineString":
            out: List[List[float]] = []
            for part in coords:
                if isinstance(part, list):
                    out.extend(part)
            return out
        return coords if isinstance(coords, list) else []

    @staticmethod
    def _coords_from_stops(stops: Any) -> List[List[float]]:
        """Derive a polyline from real stop coordinates only — never fabricated."""
        coords: List[List[float]] = []
        if not isinstance(stops, list):
            return coords
        for s in stops:
            if isinstance(s, dict):
                lng, lat = s.get("lng"), s.get("lat")
                if isinstance(lng, (int, float)) and isinstance(lat, (int, float)):
                    coords.append([float(lng), float(lat)])
        return coords

    def _extract_route_coordinates(self, data: Dict[str, Any]) -> List[List[float]]:
        """Best-effort extraction of route geometry from a RailRadar payload.

        Preferred order: explicit ``coordinates`` → ``geojson`` geometry →
        real stop positions. Returns an empty list when nothing usable exists
        so the caller can fail honestly instead of faking a corridor.
        """
        coords = data.get("coordinates") or []
        if self._coords_valid(coords):
            return coords
        coords = self._coords_from_geojson(data.get("geojson"))
        if self._coords_valid(coords):
            return coords
        return self._coords_from_stops(data.get("stops"))

    def _normalize_train_record(self, raw: Dict[str, Any], source: str) -> Optional[Dict[str, Any]]:
        """Normalize train telemetry and compute bearing, distance, and status."""
        try:
            lat = raw.get("current_lat") or raw.get("lat")
            lng = raw.get("current_lng") or raw.get("lng")
            if lat is None or lng is None:
                return None
            lat = float(lat)
            lng = float(lng)
            if lat == 0.0 or lng == 0.0 or math.isnan(lat) or math.isnan(lng):
                return None

            next_lat = raw.get("next_lat")
            next_lng = raw.get("next_lng")
            if next_lat is not None and next_lng is not None:
                next_lat = float(next_lat)
                next_lng = float(next_lng)
                bearing = calculate_bearing(lat, lng, next_lat, next_lng)
            else:
                bearing = float(raw.get("bearing") or 0.0)

            # Delay in minutes
            delay = raw.get("delay_minutes") or raw.get("delay") or 0
            try:
                delay = float(delay)
            except Exception:
                delay = 0.0

            # Status classification
            if delay <= 5.0:
                status = "on_time"
            elif delay <= 20.0:
                status = "moderate"
            else:
                status = "delayed"

            speed = raw.get("speed") or raw.get("current_speed_kmh")
            if speed is not None:
                try:
                    speed = round(float(speed), 1)
                except Exception:
                    speed = None

            return {
                "train_number": str(raw.get("train_number") or raw.get("trainNumber") or "").strip(),
                "train_name": str(raw.get("train_name") or raw.get("trainName") or "").strip(),
                "type": str(raw.get("type") or "Express").strip(),
                "current_lat": lat,
                "current_lng": lng,
                "bearing": bearing,
                "speed": speed,
                "delay_minutes": round(delay, 1),
                "status": status,
                "current_station": str(raw.get("current_station") or "").strip(),
                "current_station_name": str(raw.get("current_station_name") or "").strip(),
                "next_station": str(raw.get("next_station") or "").strip(),
                "next_station_name": str(raw.get("next_station_name") or "").strip(),
                "next_lat": next_lat,
                "next_lng": next_lng,
                "curr_distance": raw.get("curr_distance"),
                "next_distance": raw.get("next_distance"),
                "mins_since_dep": raw.get("mins_since_dep"),
                "departure_minutes": raw.get("departure_minutes"),
                "next_arrival_minutes": raw.get("next_arrival_minutes"),
                "source": source,
            }
        except Exception:
            return None

    def get_live_trains(self, force_refresh: bool = False) -> Dict[str, Any]:
        """
        Fetch a network-wide snapshot of all running trains with coordinates.
        Coalesces requests using a short 20s in-memory cache.
        Falls back to proxy or curated demo trains on upstream failure.
        """
        now = time.monotonic()
        with self._snapshot_lock:
            if not force_refresh and self._snapshot_cache and (now - self._snapshot_cache_at < self._snapshot_ttl_seconds):
                return self._snapshot_cache

        trains: List[Dict[str, Any]] = []
        source = "railradar"
        error_msg: Optional[str] = None

        if self.data_mode != "DEMO" and self.is_upstream_configured():
            # 1. Try upstream RailRadar direct
            try:
                headers = {
                    "Authorization": f"Bearer {self.api_key}",
                    "Accept": "application/json",
                }
                resp = requests.get(
                    f"{self.base_url}/legacy/trains/live-map",
                    headers=headers,
                    timeout=12.0,
                )
                if resp.status_code == 200:
                    body = resp.json()
                    raw_items = body.get("data") if isinstance(body, dict) and "data" in body else body
                    if isinstance(raw_items, list):
                        for item in raw_items:
                            rec = self._normalize_train_record(item, source="railradar")
                            if rec:
                                trains.append(rec)
            except Exception as ex:
                error_msg = f"Direct RailRadar fetch failed: {ex}"

        # 2. Try Express proxy on port 4000 if direct failed or no trains
        if not trains and self.data_mode != "DEMO":
            try:
                resp = requests.get(f"{self.proxy_url}/api/map/live", timeout=4.0)
                if resp.status_code == 200:
                    body = resp.json()
                    data = body.get("data", {})
                    raw_trains = data.get("trains", []) if isinstance(data, dict) else []
                    for item in raw_trains:
                        rec = self._normalize_train_record(item, source="railradar_proxy")
                        if rec:
                            trains.append(rec)
                    if trains:
                        source = "railradar_proxy"
            except Exception as ex:
                if not error_msg:
                    error_msg = f"Proxy fetch failed: {ex}"

        # 3. Honest availability policy — never silently fake live data:
        #    - DEMO mode (explicitly requested via DATA_MODE=DEMO): curated
        #      demo trains, clearly labelled is_demo=true for dev/preview.
        #    - AUTO / REALTIME / HYBRID modes: if every real source fails,
        #      return an empty snapshot + warning so the frontend shows
        #      "Live location temporarily unavailable" instead of fake trains.
        if self.data_mode == "DEMO":
            source = "demo"
            for item in DEMO_TRAINS_DATA:
                rec = self._normalize_train_record(item, source="demo")
                if rec:
                    trains.append(rec)
        elif not trains:
            if not error_msg:
                error_msg = "Live feed unavailable: upstream RailRadar returned no train positions."

        payload = {
            "success": True,
            "trains": trains,
            "count": len(trains),
            "updated_at": datetime.now().isoformat(),
            "source": source,
            "is_demo": source == "demo",
            "live_available": bool(trains) and source in ("railradar", "railradar_proxy"),
            "warning": error_msg if not trains else None,
        }

        with self._snapshot_lock:
            self._snapshot_cache = payload
            self._snapshot_cache_at = time.monotonic()

        return payload

    def get_train_route(self, train_number: str) -> Dict[str, Any]:
        """
        Fetch GeoJSON route geometry and station stops for a train.
        Caches real responses for 24 hours.

        Honesty policy: realtime modes never fabricate a route geometry. If no
        usable geometry can be obtained, an empty-route response is returned
        so the UI can render "route unavailable" instead of a made-up line.
        """
        clean_no = str(train_number).strip()
        with self._route_cache_lock:
            if clean_no in self._route_cache:
                return self._route_cache[clean_no]

        # 1. Try RailRadar direct
        if self.is_upstream_configured() and self.data_mode != "DEMO":
            try:
                headers = {
                    "Authorization": f"Bearer {self.api_key}",
                    "Accept": "application/json",
                }
                url = f"{self.base_url}/trains/{clean_no}/route"
                resp = requests.get(url, params={"format": "geojson", "stops": "true"}, headers=headers, timeout=12.0)
                if resp.status_code == 200:
                    body = resp.json()
                    data = body.get("data") if "data" in body else body
                    if isinstance(data, dict) and "stops" in data:
                        out = {
                            "train_number": clean_no,
                            "format": "geojson",
                            "coordinates": self._extract_route_coordinates(data),
                            "stops": data.get("stops") or [],
                            "source": "railradar",
                        }
                        if out["coordinates"] or out["stops"]:
                            with self._route_cache_lock:
                                self._route_cache[clean_no] = out
                        return out
            except Exception:
                pass

        # 2. Try Express proxy
        if self.data_mode != "DEMO":
            try:
                resp = requests.get(f"{self.proxy_url}/api/trains/{clean_no}/route", timeout=5.0)
                if resp.status_code == 200:
                    body = resp.json()
                    data = body.get("data", {})
                    if isinstance(data, dict) and "stops" in data:
                        out = {
                            "train_number": clean_no,
                            "format": "geojson",
                            "coordinates": self._extract_route_coordinates(data),
                            "stops": data.get("stops") or [],
                            "source": "railradar_proxy",
                        }
                        if out["coordinates"] or out["stops"]:
                            with self._route_cache_lock:
                                self._route_cache[clean_no] = out
                        return out
            except Exception:
                pass

        # 3. DEMO-only curated fallback — never runs in realtime modes, so
        #    a live map can't be polluted with a fabricated corridor.
        if self.data_mode == "DEMO":
            stops = []
            coordinates = []
            sample_sequence = ["NDLS", "CNB", "PRYJ", "BSB"] if clean_no == "22436" else ["NDLS", "AGC", "GWL", "BPL", "RKMP"]
            for idx, code in enumerate(sample_sequence, start=1):
                st = CORE_STATIONS.get(code)
                if st:
                    lat, lng = st["lat"], st["lng"]
                    stops.append({
                        "sequence": idx,
                        "code": code,
                        "name": st["name"],
                        "lat": lat,
                        "lng": lng,
                    })
                    coordinates.append([lng, lat])

            out = {
                "train_number": clean_no,
                "format": "geojson",
                "coordinates": coordinates,
                "stops": stops,
                "source": "demo_catalog",
            }
            with self._route_cache_lock:
                self._route_cache[clean_no] = out
            return out

        # 4. Real sources failed — honest empty route (nothing fabricated,
        #    and not cached so a later attempt can still succeed).
        return {
            "train_number": clean_no,
            "format": "geojson",
            "coordinates": [],
            "stops": [],
            "source": "unavailable",
        }

    def get_station_info(self, station_code: str) -> Dict[str, Any]:
        """Return station telemetry, coordinates, and currently active trains."""
        code = str(station_code).strip().upper()
        meta = CORE_STATIONS.get(code, {
            "code": code,
            "name": f"{code} Station",
            "lat": 28.6139,
            "lng": 77.2090,
            "zone": "NR",
            "platforms": 4,
        })

        # Find active trains currently at or approaching this station from the snapshot
        snapshot = self.get_live_trains()
        trains = snapshot.get("trains", [])
        arriving = []
        departing = []

        for t in trains:
            if t.get("next_station") == code:
                arriving.append(t)
            elif t.get("current_station") == code:
                departing.append(t)

        return {
            "code": meta["code"],
            "name": meta["name"],
            "lat": meta["lat"],
            "lng": meta["lng"],
            "zone": meta.get("zone", "IR"),
            "platforms": meta.get("platforms", 4),
            "arriving_trains": arriving,
            "departing_trains": departing,
            "total_active": len(arriving) + len(departing),
            "congestion": "Critical" if len(arriving) >= 5 else ("Congested" if len(arriving) >= 3 else ("Busy" if len(arriving) >= 2 else "Normal")),
        }

    def get_congestion_grid(self) -> List[Dict[str, Any]]:
        """
        Compute section and station congestion levels across key railway corridors.
        """
        snapshot = self.get_live_trains()
        trains = snapshot.get("trains", [])

        # Corridor definitions with key nodes
        corridors = [
            {"id": "NDLS-CNB-PRYJ", "name": "Delhi - Kanpur - Prayagraj HDN", "stations": ["NDLS", "CNB", "PRYJ", "BSB"]},
            {"id": "NDLS-BPL", "name": "Delhi - Bhopal - Central Corridor", "stations": ["NDLS", "AGC", "GWL", "BPL"]},
            {"id": "NDLS-BRC-MMCT", "name": "Western Dedicated Corridor (Delhi-Mumbai)", "stations": ["NDLS", "ADI", "BRC", "ST", "MMCT"]},
            {"id": "NDLS-HWH", "name": "Grand Chord (Delhi - Howrah)", "stations": ["NDLS", "CNB", "DDU", "PNBE", "HWH"]},
            {"id": "MAS-SBC", "name": "Southern High Density (Chennai - Bengaluru)", "stations": ["MAS", "SBC"]},
        ]

        grid = []
        for corr in corridors:
            active_count = 0
            total_delay = 0.0
            st_set = set(corr["stations"])

            for t in trains:
                if t.get("current_station") in st_set or t.get("next_station") in st_set:
                    active_count += 1
                    total_delay += t.get("delay_minutes", 0.0)

            avg_delay = total_delay / max(active_count, 1)

            if active_count >= 4 or avg_delay >= 25.0:
                level = "Critical"
                score = 88
            elif active_count >= 3 or avg_delay >= 15.0:
                level = "Congested"
                score = 68
            elif active_count >= 2 or avg_delay >= 8.0:
                level = "Busy"
                score = 45
            else:
                level = "Normal"
                score = 18

            # Coordinates of the corridor segment
            coords = []
            for c in corr["stations"]:
                if c in CORE_STATIONS:
                    coords.append([CORE_STATIONS[c]["lng"], CORE_STATIONS[c]["lat"]])

            grid.append({
                "corridor_id": corr["id"],
                "name": corr["name"],
                "level": level,
                "score": score,
                "active_trains_count": active_count,
                "avg_delay_minutes": round(avg_delay, 1),
                "coordinates": coords,
                "stations": corr["stations"],
            })

        return grid

    def get_station_catalogue(self) -> List[Dict[str, Any]]:
        """Real curated Indian Railway station catalogue with coordinates.

        Powers the zoom-dependent station overlay on the map.
        """
        return [
            {
                "code": code,
                "name": meta["name"],
                "lat": meta["lat"],
                "lng": meta["lng"],
                "zone": meta.get("zone", "IR"),
                "platforms": meta.get("platforms", 4),
                "rank": "major" if code in MAJOR_STATIONS else "minor",
            }
            for code, meta in CORE_STATIONS.items()
        ]


# Global singleton instance
map_service = RailwayMapService()
