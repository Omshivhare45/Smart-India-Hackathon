import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { rateLimit } from './lib/rateLimit.js';
import { notFoundHandler, errorHandler } from './lib/errors.js';
import healthRouter from './routes/health.js';
import trainsRouter from './routes/trains.js';
import stationsRouter from './routes/stations.js';

const app = express();

app.use(cors());
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

// Unknown /api/* paths
app.use('/api', notFoundHandler);

// Catch-all error handler
app.use(errorHandler);

const PORT = parseInt(process.env.PORT || '4000', 10);
app.listen(PORT, () => {
  console.log(`[railbuddy-backend] listening on http://localhost:${PORT}`);
});