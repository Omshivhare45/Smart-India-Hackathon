import { Router } from 'express';
import { APIError } from '../lib/errors.js';
import { queryStations, getCatalog, getStationByCode, countStations, DEFAULT_LIMIT } from '../lib/catalogStore.js';
import { sendPage, parseListQuery, assertNoStoreError } from '../lib/httpHelpers.js';

const router = Router();

// ---------------------------------------------------------------------------
// GET /api/stations?search=&page=&limit=&search_mode=prefix|text
//
// Paginated, searchable view of the synced station catalogue.
//
//   limit=0  returns the whole catalogue in one response. This is the legacy
//            contract the frontend's full-directory dropdown used; prefer a
//            paged request for anything interactive.
// ---------------------------------------------------------------------------
router.get('/stations', async (req, res, next) => {
  try {
    const { search, searchMode, page, limit } = parseListQuery(req.query, { defaultLimit: DEFAULT_LIMIT });

    // Back-compat: the original handler answered ?limit=0 with
    // { success, count, data: [{ code, name }] } and no pagination block.
    if (req.query.limit !== undefined && String(req.query.limit) === '0' && !search) {
      const data = await getCatalog(0);
      return res.json({ success: true, count: data.length, data });
    }

    const result = assertNoStoreError(await queryStations({ search, searchMode, page, limit }));
    return sendPage(res, result);
  } catch (err) {
    return next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /api/stations/search?q=Delhi&limit=12
//
// Original endpoint, unchanged in shape. Prefer /api/stations?search= for new
// callers; this alias keeps older clients working.
// ---------------------------------------------------------------------------
router.get('/stations/search', async (req, res, next) => {
  try {
    const q = String(req.query.q || req.query.search || '').trim();
    if (!q) throw new APIError('BAD_REQUEST', '"q" query parameter is required (e.g. ?q=Delhi)', 400);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 12, 1), 50);
    const result = assertNoStoreError(await queryStations({ search: q, page: 1, limit }));
    return res.json({ success: true, data: result.data });
  } catch (err) {
    return next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /api/stations/count  - catalogue size, for readiness checks
//
// Declared before /stations/:code so the literal path wins the match.
// ---------------------------------------------------------------------------
router.get('/stations/count', async (_req, res, next) => {
  try {
    const total = await countStations();
    return res.json({ success: true, data: { total } });
  } catch (err) {
    return next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /api/stations/:code  - single station lookup
// ---------------------------------------------------------------------------
router.get('/stations/:code', async (req, res, next) => {
  try {
    const station = await getStationByCode(String(req.params.code || ''));
    if (!station) {
      throw new APIError('NOT_FOUND', `No station with code "${req.params.code}" in the catalogue.`, 404);
    }
    return res.json({ success: true, data: station });
  } catch (err) {
    return next(err);
  }
});

export default router;
