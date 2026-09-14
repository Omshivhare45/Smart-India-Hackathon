export function rateLimit({ windowMs = 60000, max = 120 } = {}) {
  const hits = new Map();

  return (req, res, next) => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const now = Date.now();
    const bucket = hits.get(ip);

    if (!bucket || now - bucket.start > windowMs) {
      hits.set(ip, { start: now, count: 1 });
      return next();
    }

    bucket.count += 1;
    if (bucket.count > max) {
      return res.status(429).json({
        success: false,
        error: {
          code: 'RATE_LIMITED',
          message: 'Too many requests. Please slow down and try again shortly.',
        },
      });
    }

    return next();
  };
}