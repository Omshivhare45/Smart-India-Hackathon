import { APIError } from './errors.js';

export const RAILRADAR_BASE_URL = 'https://api.railradar.in/v1';

const API_KEY = process.env.RAILRADAR_API_KEY || '';

export function railradarConfigured() {
  return Boolean(API_KEY);
}

const UPSTREAM_STATUS_MAP = {
  400: ['BAD_REQUEST', 400],
  401: ['INVALID_API_KEY', 401],
  403: ['FORBIDDEN', 403],
  404: ['NOT_FOUND', 404],
  405: ['BAD_REQUEST', 400],
  422: ['BAD_REQUEST', 400],
  429: ['RATE_LIMITED', 429],
  500: ['SERVICE_UNAVAILABLE', 503],
  502: ['SERVICE_UNAVAILABLE', 503],
  503: ['SERVICE_UNAVAILABLE', 503],
  504: ['UPSTREAM_TIMEOUT', 504],
};

function normalizeData(body) {
  return body && body.success === true && body.data !== undefined ? body.data : body;
}

async function railradarFetch(path, { params } = {}) {
  if (!railradarConfigured()) {
    throw new APIError(
      'INVALID_API_KEY',
      'RailRadar API key is not configured on the backend. Set RAILRADAR_API_KEY in backend/.env.',
      401,
    );
  }

  const url = new URL(`${RAILRADAR_BASE_URL}${path}`);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== '') {
        url.searchParams.set(key, String(value));
      }
    }
  }

  let res;
  try {
    res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${API_KEY}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(20000),
    });
  } catch (err) {
    if (err && (err.name === 'TimeoutError' || err.name === 'AbortError')) {
      throw new APIError('UPSTREAM_TIMEOUT', 'RailRadar request timed out', 504);
    }
    throw new APIError('UPSTREAM_UNAVAILABLE', `Unable to reach RailRadar: ${err.message}`, 502);
  }

  let body = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }

  if (!res.ok || !body || body.success !== true) {
    const mapped = UPSTREAM_STATUS_MAP[res.status];
    const code = (body && body.error && body.error.code) || (mapped ? mapped[0] : 'RAILRADAR_ERROR');
    const status = mapped ? mapped[1] : res.status;
    const message =
      (body && body.error && body.error.message) || `RailRadar request failed (HTTP ${res.status})`;
    throw new APIError(code, message, status);
  }

  return normalizeData(body);
}

// ------------------------------------------------------------------
// RailRadar endpoints
// ------------------------------------------------------------------

export async function getTrainDetails(trainNumber) {
  return railradarFetch(`/trains/${encodeURIComponent(trainNumber)}`);
}

export async function getLiveStatus(trainNumber, { date, includeCoordinates, geometry, format } = {}) {
  return railradarFetch(`/trains/${encodeURIComponent(trainNumber)}/live`, {
    params: {
      date,
      haltsOnly: 'true',
      includeCoordinates: includeCoordinates === true ? 'true' : undefined,
      geometry: geometry === true ? 'true' : undefined,
      format: format === 'geojson' || format === 'polyline' || format === 'coordinates' ? format : undefined,
    },
  });
}

export async function getTrainsBetween(from, to, { date, live } = {}) {
  return railradarFetch(`/trains/between/${encodeURIComponent(from)}/${encodeURIComponent(to)}`, {
    params: { date, live: live === true ? 'true' : 'false' },
  });
}

// ------------------------------------------------------------------
// Live railway map data
// ------------------------------------------------------------------

// Bulk snapshot of running trains with real coordinates (RailRadar "Live Map
// Snapshot" feed). One request covers the whole network - never per-train.
export async function getLiveMapSnapshot() {
  return railradarFetch('/legacy/trains/live-map');
}

// High-resolution GeoJSON track geometry + station stops for a train route.
export async function getTrainRouteGeometry(trainNumber, { format = 'geojson', stops = true } = {}) {
  return railradarFetch(`/trains/${encodeURIComponent(trainNumber)}/route`, {
    params: { format, stops: stops === true ? 'true' : 'false' },
  });
}

// Fast in-memory autocomplete for train numbers and train names.
export async function searchTrains(q, limit = 10) {
  return railradarFetch('/lookup/search/trains', { params: { q, limit } });
}

// ------------------------------------------------------------------
// Station directory lookup (cached to protect the API quota)
// ------------------------------------------------------------------

let stationsCache = null;
let stationsCacheAt = 0;
const STATIONS_CACHE_TTL_MS = 60 * 60 * 1000;

export async function searchStations(q) {
  const now = Date.now();
  if (!stationsCache || now - stationsCacheAt > STATIONS_CACHE_TTL_MS) {
    const data = await railradarFetch('/lookup/stations');
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      throw new APIError('STATION_LOOKUP_FAILED', 'RailRadar returned an invalid station directory', 502);
    }
    stationsCache = data;
    stationsCacheAt = now;
  }

  const needle = String(q || '').trim().toLowerCase();
  const entries = Object.entries(stationsCache).filter(([code, name]) => {
    if (!needle) return true;
    return code.toLowerCase().includes(needle) || String(name).toLowerCase().includes(needle);
  });

  const limit = needle ? 12 : 30;
  return entries.slice(0, limit).map(([code, name]) => ({ code, name }));
}