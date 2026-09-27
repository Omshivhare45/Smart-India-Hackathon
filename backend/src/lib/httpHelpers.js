// Shared helpers for the catalogue routes: one response shape, one set of
// query-string rules. Keeping these in one place is what makes
// /api/stations, /api/trains and /api/admin/* respond identically.

import { APIError } from './errors.js';
import { parsePagination, MAX_LIMIT } from './catalogStore.js';

export const DEFAULT_SEARCH_MODE = 'prefix';

/**
 * Standard success envelope for paginated collections:
 *   { success, data, pagination: { page, limit, total, total_pages, has_more } }
 */
export function sendPage(res, { data, total, page, limit, totalPages, hasMore }, extra = {}) {
  return res.json({
    success: true,
    count: data.length,
    data,
    pagination: {
      page,
      limit,
      total,
      total_pages: totalPages,
      has_more: hasMore,
    },
    ...extra,
  });
}

/**
 * Validate `search`, `page`, `limit` and `search_mode` from a query object.
 * Throws APIError(400) with an actionable message on bad input.
 */
export function parseListQuery(query = {}, { defaultLimit = 20, maxLimit = MAX_LIMIT } = {}) {
  const paged = parsePagination(query, { defaultLimit, maxLimit });
  if (paged.error) throw new APIError('BAD_REQUEST', paged.error, 400);

  const search = query.search !== undefined && query.search !== null ? String(query.search) : '';
  const searchMode = query.search_mode ? String(query.search_mode) : DEFAULT_SEARCH_MODE;
  if (!['prefix', 'text'].includes(searchMode)) {
    throw new APIError('BAD_REQUEST', '"search_mode" must be one of: prefix, text', 400);
  }
  if (search.length > 120) {
    throw new APIError('BAD_REQUEST', '"search" must be 120 characters or fewer', 400);
  }

  return {
    search: search.trim(),
    searchMode,
    page: paged.page,
    limit: paged.limit,
  };
}

/** Turn a store-level { error } result into a 400 APIError. */
export function assertNoStoreError(result) {
  if (result && result.error) throw new APIError('BAD_REQUEST', result.error, 400);
  return result;
}

export function parseBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  return String(value).toLowerCase() === 'true' || String(value) === '1';
}
