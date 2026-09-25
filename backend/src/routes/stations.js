import { Router } from 'express';
import { APIError } from '../lib/errors.js';
import { searchStations, getCatalog } from '../lib/stationStore.js';

const router = Router();

// ------------------------------------------------------------------
// GET /api/stations?limit=0   (full real IR station catalog; 0 = all)
// ------------------------------------------------------------------
router.get('/stations', async (req, res, next) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 0;
    const data = await getCatalog(limit < 0 ? 0 : limit);
    res.json({ success: true, count: data.length, data });
  } catch (err) {
    next(err);
  }
});

// ------------------------------------------------------------------
// GET /api/stations/search?q=Delhi&limit=...
// ------------------------------------------------------------------
router.get('/stations/search', async (req, res, next) => {
  try {
    const q = String(req.query.q || '').trim();
    if (!q) throw new APIError('BAD_REQUEST', '"q" query parameter is required (e.g. ?q=Delhi)', 400);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 12, 1), 50);
    const data = await searchStations(q, limit);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

export default router;