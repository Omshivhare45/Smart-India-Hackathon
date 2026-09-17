import { Router } from 'express';
import { APIError } from '../lib/errors.js';
import { getLiveMapSnapshot } from '../lib/railradar.js';

const router = Router();

// ------------------------------------------------------------------
// Live railway map feed.
//
// One bulk snapshot of every running train with real coordinates for the
// whole network. The snapshot is cached briefly in-process so multiple open
// map tabs / refreshes do not hammer the RailRadar quota (frontend polls on
// a 60 s cadence; the cache also coalesces concurrent requests).
// ------------------------------------------------------------------

const SNAPSHOT_TTL_MS = 15 * 1000;

let snapshotCache = null;
let snapshotCacheAt = 0;
let snapshotInFlight = null;

function snapshotToPayload(data, meta) {
  if (!Array.isArray(data)) {
    throw new APIError('LIVE_MAP_INVALID', 'RailRadar live-map snapshot returned an unexpected payload', 502);
  }

  const trains = data
    .filter(
      (t) =>
        t &&
        typeof t.current_lat === 'number' &&
        typeof t.current_lng === 'number' &&
        !Number.isNaN(t.current_lat) &&
        !Number.isNaN(t.current_lng) &&
        t.current_lat !== 0 &&
        t.current_lng !== 0,
    )
    .map((t) => ({
      train_number: t.train_number,
      train_name: t.train_name,
      type: t.type,
      mins_since_dep: t.mins_since_dep,
      current_station: t.current_station,
      current_station_name: t.current_station_name,
      current_lat: t.current_lat,
      current_lng: t.current_lng,
      departure_minutes: t.departure_minutes,
      current_day: t.current_day,
      next_station: t.next_station,
      next_station_name: t.next_station_name,
      next_lat: t.next_lat,
      next_lng: t.next_lng,
      next_arrival_minutes: t.next_arrival_minutes,
      curr_distance: t.curr_distance,
      next_distance: t.next_distance,
    }));

  return {
    trains,
    count: trains.length,
    raw_count: Array.isArray(data) ? data.length : 0,
    updated_at: (meta && meta.timestamp) || new Date().toISOString(),
    source: 'railradar',
  };
}

async function fetchSnapshotOnce() {
  const now = Date.now();
  if (snapshotCache && now - snapshotCacheAt < SNAPSHOT_TTL_MS) {
    return snapshotCache;
  }
  if (snapshotInFlight) return snapshotInFlight;

  snapshotInFlight = (async () => {
    const raw = await getLiveMapSnapshot();
    const data = raw && Array.isArray(raw) ? raw : [];
    const payload = snapshotToPayload(data, raw && raw.meta);
    snapshotCache = payload;
    snapshotCacheAt = Date.now();
    return payload;
  })().finally(() => {
    snapshotInFlight = null;
  });

  return snapshotInFlight;
}

// ------------------------------------------------------------------
// GET /api/map/live
// ------------------------------------------------------------------
router.get('/map/live', async (req, res, next) => {
  try {
    const payload = await fetchSnapshotOnce();
    res.set('Cache-Control', `public, max-age=${Math.floor(SNAPSHOT_TTL_MS / 1000)}`);
    res.json({ success: true, data: payload });
  } catch (err) {
    snapshotCache = null;
    next(err);
  }
});

export default router;