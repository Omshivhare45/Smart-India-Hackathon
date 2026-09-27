import { Router } from 'express';
import { APIError } from '../lib/errors.js';
import {
  getTrainDetails,
  getLiveStatus,
  getTrainsBetween,
  getTrainRouteGeometry,
} from '../lib/railradar.js';
import {
  queryTrains,
  getTrainByNumber,
  getScheduleByTrainNumber,
  normalizeTrainNumber,
  DEFAULT_LIMIT,
} from '../lib/catalogStore.js';
import { sendPage, parseListQuery, assertNoStoreError, parseBoolean } from '../lib/httpHelpers.js';

const router = Router();

const TRAIN_NUMBER_RE = /^\d{4,6}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// ---------------------------------------------------------------------------
// Live / route endpoints (RailRadar pass-through, unchanged)
//
// These stay provider-backed on purpose: live position and track geometry are
// per-request, time-sensitive data that a catalogue sync must not serve.
// ---------------------------------------------------------------------------

// GET /api/trains/between?from=...&to=...&date=...&live=true|false
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

// GET /api/trains/search?q=...&page=&limit=&search_mode=prefix|text
//
// MongoDB-backed autocomplete over the synced `trains` collection. It reads only
// the database, so typing in the search box never spends RailRadar quota - the
// provider is consulted only by the admin sync (POST /api/admin/sync).
//
// Mirrors /api/stations/search; GET /api/trains?search= is the same query under
// the list-style parameter name.
router.get('/trains/search', async (req, res, next) => {
  try {
    const q = String(req.query.q ?? req.query.search ?? '').trim();
    if (!q) throw new APIError('BAD_REQUEST', '"q" query parameter is required (e.g. ?q=Rajdhani)', 400);

    const { searchMode, page, limit } = parseListQuery(
      { ...req.query, search: q },
      { defaultLimit: DEFAULT_LIMIT },
    );
    // "limit=0" means "no limit" to the catalogue list endpoint, which would
    // dump every match here; an autocomplete must always be bounded.
    const bounded = limit === 0 ? DEFAULT_LIMIT : limit;

    const result = assertNoStoreError(await queryTrains({ search: q, searchMode, page, limit: bounded }));
    return sendPage(res, result);
  } catch (err) {
    return next(err);
  }
});

// GET /api/trains/:number/live?date=...&includeCoordinates=true&geometry=...&format=...
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

// GET /api/trains/:number/route?format=geojson&stops=true
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

// ---------------------------------------------------------------------------
// Catalogue endpoints (MongoDB)
// ---------------------------------------------------------------------------

// GET /api/trains?search=&page=&limit=&search_mode=prefix|text
router.get('/trains', async (req, res, next) => {
  try {
    const { search, searchMode, page, limit } = parseListQuery(req.query, { defaultLimit: DEFAULT_LIMIT });
    const result = assertNoStoreError(await queryTrains({ search, searchMode, page, limit }));
    return sendPage(res, result);
  } catch (err) {
    return next(err);
  }
});

// GET /api/trains/:number/schedule
//
// Serves the synced NTES timetable. Returns 404 with an explicit reason when no
// schedule has been synced, so the caller can tell "not synced yet" apart from
// "this train does not exist".
router.get('/trains/:number/schedule', async (req, res, next) => {
  try {
    const raw = String(req.params.number || '').trim();
    const num = normalizeTrainNumber(raw);
    if (!num) throw new APIError('INVALID_TRAIN_NUMBER', 'Train number must be 4–6 digits', 400);

    const schedule = await getScheduleByTrainNumber(num);
    if (!schedule) {
      const exists = await getTrainByNumber(num);
      throw new APIError(
        'SCHEDULE_NOT_FOUND',
        exists
          ? `Train ${num} is in the catalogue but has no synced schedule. Run: python ml/scripts/sync_ntes.py --trains ${num}`
          : `Train ${num} is not in the catalogue. Run: node backend/scripts/sync-catalog.mjs`,
        404,
      );
    }
    return res.json({ success: true, data: schedule });
  } catch (err) {
    return next(err);
  }
});

// GET /api/trains/:number
//
// Prefers the synced catalogue (free, no provider quota). A catalogue row that
// came only from the bare RailRadar directory carries just number+name, so when
// the row is thin the live provider is consulted for the full detail - the
// response is never silently less complete than the provider could give.
// `source` says which one answered.
router.get('/trains/:number', async (req, res, next) => {
  try {
    const raw = String(req.params.number || '').trim();
    const num = normalizeTrainNumber(raw);
    if (!num) throw new APIError('INVALID_TRAIN_NUMBER', 'Train number must be 4–6 digits', 400);

    const cached = await getTrainByNumber(num);
    if (cached && isEnriched(cached)) {
      return res.json({ success: true, source: 'catalogue', data: cached });
    }

    const data = await getTrainDetails(num);
    return res.json({
      success: true,
      source: 'railradar',
      data,
      // Flag the gap so an operator knows the catalogue needs enriching.
      catalogue_status: cached ? 'present_but_minimal' : 'not_synced',
    });
  } catch (err) {
    return next(err);
  }
});

/** A train row counts as enriched once NTES has supplied its route or type. */
function isEnriched(train) {
  return Boolean(train && (train.source_code || train.destination_code || train.type));
}

export default router;
