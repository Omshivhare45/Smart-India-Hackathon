import { Router } from 'express';
import { railradarConfigured, RAILRADAR_BASE_URL } from '../lib/railradar.js';

const router = Router();

router.get('/health', (req, res) => {
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
    },
  });
});

export default router;