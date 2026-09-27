import { Router } from 'express';
import { railradarConfigured, RAILRADAR_BASE_URL } from '../lib/railradar.js';
import { isConnected, collectionCounts } from '../lib/db.js';
import { adminConfigured } from '../lib/adminAuth.js';

const router = Router();

// Stays HTTP 200 even when MongoDB is unreachable: Render polls this path, and
// restarting the process cannot repair a bad MONGODB_URI or a paused cluster.
// The database block below is what monitoring should alert on.
router.get('/health', async (_req, res) => {
  let database;
  if (isConnected()) {
    try {
      database = { connected: true, counts: await collectionCounts() };
    } catch (err) {
      database = { connected: false, error: err.message };
    }
  } else {
    database = { connected: false, note: 'no connection opened yet' };
  }

  res.json({
    success: true,
    data: {
      service: 'railbuddy-backend',
      status: 'ok',
      uptimeSeconds: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
      railradar: {
        configured: railradarConfigured(),
        baseUrl: RAILRADAR_BASE_URL,
      },
      database,
      admin: { configured: adminConfigured() },
    },
  });
});

export default router;
