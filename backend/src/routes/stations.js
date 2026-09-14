import { Router } from 'express';
import { APIError } from '../lib/errors.js';
import { searchStations } from '../lib/railradar.js';

const router = Router();

// ------------------------------------------------------------------
// GET /api/stations/search?q=Delhi
// ------------------------------------------------------------------
router.get('/stations/search', async (req, res, next) => {
  try {
    const q = String(req.query.q || '').trim();
    if (!q) throw new APIError('BAD_REQUEST', '"q" query parameter is required (e.g. ?q=Delhi)', 400);
    const data = await searchStations(q);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

export default router;