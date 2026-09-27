import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { rateLimit } from './lib/rateLimit.js';
import { notFoundHandler, errorHandler } from './lib/errors.js';
import healthRouter from './routes/health.js';
import trainsRouter from './routes/trains.js';
import stationsRouter from './routes/stations.js';
import mapRouter from './routes/map.js';
import adminRouter from './routes/admin.js';
import { connectWithIndexes } from './lib/db.js';

const app = express();

const allowedOrigins = [
  "https://railbuddy.vercel.app",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
];

app.use(cors({
  origin: allowedOrigins,
  credentials: true,
}));
app.use(express.json());

app.use(
  rateLimit({
    windowMs: 60000,
    max: parseInt(process.env.RAILRADAR_RATE_LIMIT_PER_MIN || '120', 10),
  }),
);

// RailBuddy API routes (the frontend proxies /api/* here via Next.js rewrites)
app.use('/api', healthRouter);
app.use('/api', trainsRouter);
app.use('/api', stationsRouter);
app.use('/api', mapRouter);
app.use('/api', adminRouter);

// Unknown /api/* paths
app.use('/api', notFoundHandler);

// Catch-all error handler
app.use(errorHandler);

const PORT = parseInt(process.env.PORT || '4000', 10);
app.listen(PORT, () => {
  console.log(`[railbuddy-backend] listening on http://localhost:${PORT}`);

  // Open MongoDB and create indexes in the background. A failure here must not
  // stop the server: live tracking, the map and the RailRadar pass-throughs all
  // still work without a database, and /api/health reports the degraded state.
  connectWithIndexes()
    .then((indexes) => {
      const total = Object.values(indexes).reduce((sum, names) => sum + names.length, 0);
      console.log(`[railbuddy-backend] MongoDB ready, ${total} index(es) ensured`);
    })
    .catch((err) => {
      console.warn(`[railbuddy-backend] MongoDB unavailable (${err.message}).`);
      console.warn('[railbuddy-backend] Catalogue endpoints will fail until MONGODB_URI is reachable.');
    });
});
