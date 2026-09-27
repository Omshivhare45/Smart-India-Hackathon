// Shared-secret authentication for admin-only endpoints (catalogue sync).
//
// The caller must send `x-admin-token: <SYNC_ADMIN_KEY>`. The comparison is
// constant-time: both values are SHA-256 hashed first so differing lengths
// cannot be detected through timing, then compared with crypto.timingSafeEqual.
//
// Deliberately not a user system: this guards an operational endpoint, not
// personal data. Rotate the key like any other secret; it is read from the
// environment and never written to a response or a log line.

import crypto from 'node:crypto';
import { APIError } from './errors.js';

export const ADMIN_TOKEN_HEADER = 'x-admin-token';

/** True when an admin key is configured. The key itself is never exposed. */
export function adminConfigured() {
  return Boolean(process.env.SYNC_ADMIN_KEY);
}

function sha256(value) {
  return crypto.createHash('sha256').update(String(value), 'utf8').digest();
}

/** Constant-time equality that tolerates differing lengths. */
export function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  return crypto.timingSafeEqual(sha256(a), sha256(b));
}

/**
 * Express middleware factory. Throws APIError(401) unless the request carries
 * the correct token. When no key is configured the endpoint is refused with 503
 * rather than left open.
 */
export function requireAdmin({ header = ADMIN_TOKEN_HEADER } = {}) {
  return function adminGuard(req, _res, next) {
    const expected = process.env.SYNC_ADMIN_KEY || '';

    if (!expected) {
      return next(
        new APIError(
          'ADMIN_NOT_CONFIGURED',
          'Admin access is not configured on this server. Set SYNC_ADMIN_KEY to enable it.',
          503,
        ),
      );
    }

    const provided = req.get(header) || req.get('authorization')?.replace(/^Bearer\s+/i, '') || '';
    if (!provided || !safeEqual(provided, expected)) {
      return next(new APIError('UNAUTHORIZED', `A valid ${header} header is required.`, 401));
    }

    return next();
  };
}
