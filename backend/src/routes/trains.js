import { Router } from 'express';
import { APIError } from '../lib/errors.js';
import {
  getTrainDetails,
  getLiveStatus,
  getTrainsBetween,
  getTrainRouteGeometry,
  searchTrains,
} from '../lib/railradar.js';

const router = Router();

const TRAIN_NUMBER_RE = /^\d{4,6}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function parseBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  return String(value).toLowerCase() === 'true' || String(value) === '1';
}

// ------------------------------------------------------------------
// GET /api/trains/between?from=...&to=...&date=...&live=true|false
// ------------------------------------------------------------------
router.get('/trains/between', async (req, res, next) => {
  try {
    const from = String(req.query.from || '').trim().toUpperCase();
    const to = String(req.query.to || '').trim().toUpperCase();
    if (!from || !to) throw new APIError('BAD_REQUEST', 'Both "from" and "to" station codes are required', 400);
    if (from === to) throw new APIError('BAD_REQUEST', '"from" and "to" must be different stations', 400);
    const date = req.query.date ? String(req.query.date) : undefined;
    if (date && !DATE_RE.test(date)) throw new APIError('BAD_REQUEST', '"date" must be in YYYY-MM-DD format', 400);
    const live = parseBoolean(req.query.live);
    const data = await getTrainsBetween(from, to, { date, live });
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

// ------------------------------------------------------------------
// GET /api/trains/search?q=...&limit=...
// ------------------------------------------------------------------
router.get('/trains/search', async (req, res, next) => {
  try {
    const q = String(req.query.q || '').trim();
    if (!q) throw new APIError('BAD_REQUEST', '"q" query parameter is required', 400);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 50);
    const data = await searchTrains(q, limit);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

// ------------------------------------------------------------------
// GET /api/trains/:number/live?date=...&includeCoordinates=true&geometry=...&format=...
// ------------------------------------------------------------------
router.get('/trains/:number/live', async (req, res, next) => {
  try {
    const num = String(req.params.number || '').trim();
    if (!TRAIN_NUMBER_RE.test(num)) throw new APIError('INVALID_TRAIN_NUMBER', 'Train number must be 4–6 digits', 400);
    const date = req.query.date ? String(req.query.date) : undefined;
    if (date && !DATE_RE.test(date)) throw new APIError('BAD_REQUEST', '"date" must be in YYYY-MM-DD format', 400);
    const includeCoordinates = parseBoolean(req.query.includeCoordinates);
    const geometry = parseBoolean(req.query.geometry);
    const format = req.query.format ? String(req.query.format) : undefined;
    const data = await getLiveStatus(num, { date, includeCoordinates, geometry, format });
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

// ------------------------------------------------------------------
// GET /api/trains/:number/route?format=geojson&stops=true
// ------------------------------------------------------------------

const routeCache = new Map();
const ROUTE_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

router.get('/trains/:number/route', async (req, res, next) => {
  try {
    const num = String(req.params.number || '').trim();
    if (!TRAIN_NUMBER_RE.test(num)) throw new APIError('INVALID_TRAIN_NUMBER', 'Train number must be 4–6 digits', 400);
    const format = req.query.format ? String(req.query.format) : 'geojson';
    if (!['geojson', 'polyline', 'coordinates'].includes(format)) {
      throw new APIError('BAD_REQUEST', '"format" must be geojson, polyline or coordinates', 400);
    }
    const stops = parseBoolean(req.query.stops, true);

    // Route geometry is static per train -> cache long to protect the quota.
    const cacheKey = `${num}:${format}:${stops}`;
    const cached = routeCache.get(cacheKey);
    if (cached && Date.now() - cached.at < ROUTE_CACHE_TTL_MS) {
      return res.json({ success: true, data: cached.data, cached: true });
    }

    const data = await getTrainRouteGeometry(num, { format, stops });
    routeCache.set(cacheKey, { at: Date.now(), data });
    if (routeCache.size > 500) {
      const oldest = [...routeCache.entries()].sort((a, b) => a[1].at - b[1].at).slice(0, 50);
      for (const [k] of oldest) routeCache.delete(k);
    }
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

// ------------------------------------------------------------------
// GET /api/trains/:number
// ------------------------------------------------------------------
router.get('/trains/:number', async (req, res, next) => {
  try {
    const num = String(req.params.number || '').trim();
    if (!TRAIN_NUMBER_RE.test(num)) throw new APIError('INVALID_TRAIN_NUMBER', 'Train number must be 4–6 digits', 400);
    const data = await getTrainDetails(num);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

export default router;