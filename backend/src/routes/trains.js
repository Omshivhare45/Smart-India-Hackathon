import { Router } from 'express';
import { APIError } from '../lib/errors.js';
import {
  getTrainDetails,
  getLiveStatus,
  getTrainsBetween,
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
// GET /api/trains/:number/live?date=...
// ------------------------------------------------------------------
router.get('/trains/:number/live', async (req, res, next) => {
  try {
    const num = String(req.params.number || '').trim();
    if (!TRAIN_NUMBER_RE.test(num)) throw new APIError('INVALID_TRAIN_NUMBER', 'Train number must be 4–6 digits', 400);
    const date = req.query.date ? String(req.query.date) : undefined;
    if (date && !DATE_RE.test(date)) throw new APIError('BAD_REQUEST', '"date" must be in YYYY-MM-DD format', 400);
    const data = await getLiveStatus(num, { date });
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