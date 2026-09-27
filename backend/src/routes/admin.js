import { Router } from 'express';
import { APIError } from '../lib/errors.js';
import { requireAdmin, adminConfigured } from '../lib/adminAuth.js';
import { syncCatalog, syncInProgress } from '../lib/sync.js';
import { listSyncLogs, getLastSyncLog } from '../lib/catalogStore.js';
import { parseBoolean } from '../lib/httpHelpers.js';

const router = Router();

// Everything below requires the x-admin-token header. GET /admin/status is
// deliberately outside the guard so a health check can see whether the endpoint
// is enabled without holding the secret.
router.get('/admin/status', (_req, res) => {
  res.json({
    success: true,
    data: {
      admin_configured: adminConfigured(),
      sync_running: syncInProgress(),
    },
  });
});

router.use('/admin', requireAdmin());

// ---------------------------------------------------------------------------
// POST /api/admin/sync?targets=stations,trains&dry_run=false
//
// Refreshes the RailRadar bulk catalogues. A full run costs 2 provider
// requests against a plan of 10/minute and 1000/month, and the monthly ceiling
// is shared with the live-tracking and map endpoints.
//
// Runs synchronously so the response carries the outcome. Only one sync may run
// at a time; a concurrent caller gets 409.
//
// Schedules are NOT synced here: they need the Python NTES client. Run
// `python ml/scripts/sync_ntes.py` as a separate job.
// ---------------------------------------------------------------------------
router.post('/admin/sync', async (req, res, next) => {
  try {
    const requested = String(req.query.targets || req.body?.targets || 'stations,trains');
    const targets = requested
      .split(',')
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean);

    const unknown = targets.filter((t) => t !== 'stations' && t !== 'trains');
    if (unknown.length) {
      throw new APIError('BAD_REQUEST', `Unknown target(s): ${unknown.join(', ')}. Use: stations, trains`, 400);
    }
    if (!targets.length) {
      throw new APIError('BAD_REQUEST', 'At least one target is required (stations, trains)', 400);
    }

    const dryRun = parseBoolean(req.query.dry_run ?? req.body?.dry_run, false);

    const result = await syncCatalog({ targets, dryRun, trigger: 'api' });
    return res.status(result.status === 'failed' ? 502 : 200).json({
      success: result.status !== 'failed',
      data: {
        status: result.status,
        dry_run: result.dry_run,
        targets: result.targets,
        counts: result.counts,
        warnings: result.warnings,
        errors: result.errors,
        results: result.results,
        synced_at: result.log?.finished_at || new Date().toISOString(),
      },
    });
  } catch (err) {
    return next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /api/admin/sync/logs?limit=20&job=railradar-catalogue
// GET /api/admin/sync/last?job=...
// ---------------------------------------------------------------------------
router.get('/admin/sync/logs', async (req, res, next) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);
    const data = await listSyncLogs({ limit, job: req.query.job ? String(req.query.job) : undefined });
    res.json({ success: true, count: data.length, data });
  } catch (err) {
    next(err);
  }
});

router.get('/admin/sync/last', async (req, res, next) => {
  try {
    const job = String(req.query.job || 'railradar-catalogue');
    const data = await getLastSyncLog(job);
    if (!data) throw new APIError('NOT_FOUND', `No completed "${job}" sync has been recorded yet.`, 404);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

export default router;
