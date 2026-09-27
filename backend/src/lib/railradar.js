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

// Provider-side train autocomplete. NOT used by GET /api/trains/search, which
// serves the MongoDB catalogue so that typing never spends provider quota; this
// is kept for one-off provider checks and diagnostics.
export async function searchTrains(q, limit = 10) {
  return railradarFetch('/lookup/search/trains', { params: { q, limit } });
}

// --------------------------------------------------------------------------
// Station / train catalogues
// --------------------------------------------------------------------------
//
// Both `/lookup/stations` and `/lookup/trains` are BULK endpoints: they return
// the entire directory in a single response as a `{ key: name }` map and ignore
// any `limit`/`page` parameter. Verified 2026-09-26 against the live API:
//   GET /v1/lookup/stations -> 200, 13,005 entries, meta.activeStationCount=8634
//   GET /v1/lookup/trains   -> 200, 525,673 bytes of `{ trainNumber: name }`
// There is no server-side pagination, so the sync fetches once and upserts.
//
// Metering is aggressive: x-ratelimit-limit-min=10 and
// x-ratelimit-limit-month=1000. A 429 body names the exhausted window, e.g.
// "Monthly quota exceeded. Maximum 1000 requests per month."

let trainCatalogCache = null;
let trainCatalogCacheAt = 0;
const TRAIN_CATALOG_TTL_MS = 12 * 60 * 60 * 1000;

/** Full RailRadar train directory (number -> name) as [{number, name}]. */
export async function getTrainCatalog({ forceRefresh = false } = {}) {
  const now = Date.now();
  if (forceRefresh || !trainCatalogCache || now - trainCatalogCacheAt > TRAIN_CATALOG_TTL_MS) {
    const data = await railradarFetch('/lookup/trains');
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      throw new APIError('TRAIN_LOOKUP_FAILED', 'RailRadar returned an invalid train directory', 502);
    }
    trainCatalogCache = data;
    trainCatalogCacheAt = now;
  }
  return Object.entries(trainCatalogCache).map(([number, name]) => ({ number, name }));
}

// ------------------------------------------------------------------
// Station directory lookup (cached to protect the API quota)
// ------------------------------------------------------------------

let stationsCache = null;
let stationsCacheAt = 0;
const STATIONS_CACHE_TTL_MS = 60 * 60 * 1000;

/** Full RailRadar station directory (code -> name), cached for 1 hour. */
export async function getStationCatalog(limit = 0) {
  const now = Date.now();
  if (!stationsCache || now - stationsCacheAt > STATIONS_CACHE_TTL_MS) {
    const data = await railradarFetch('/lookup/stations');
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      throw new APIError('STATION_LOOKUP_FAILED', 'RailRadar returned an invalid station directory', 502);
    }
    stationsCache = data;
    stationsCacheAt = now;
  }

  const list = Object.entries(stationsCache).map(([code, name]) => ({ code, name }));
  return limit > 0 ? list.slice(0, Math.floor(limit)) : list;
}

/** Search the real station directory by code or name (limit caps the result). */
export async function searchStations(q, limit = 12) {
  const needle = String(q || '').trim().toLowerCase();
  const list = await getStationCatalog(0);

  if (!needle) return list.slice(0, limit);
  return list
    .filter(
      (s) => s.code.toLowerCase().includes(needle) || String(s.name).toLowerCase().includes(needle),
    )
    .slice(0, limit);
}