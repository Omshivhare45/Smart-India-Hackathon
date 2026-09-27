// RailBuddy catalogue store: stations, trains, schedules, sync_logs.
//
// Pure persistence + query layer. All records originate from a real upstream
// (RailRadar /lookup/stations, RailRadar /lookup/trains, NTES search /
// train_info / schedule). Nothing here invents codes, names, coordinates or
// timetables: fields a source cannot supply are stored as null.
//
// Conventions
//   station.code   UPPERCASE, e.g. "NDLS"          (normalizeStationCode)
//   station.name   trimmed, single-spaced
//   train.number   digits only, e.g. "12951"       (normalizeTrainNumber)
//   schedule.train_number  digits only, one document per train
//
// Every write is an upsert keyed on that identity field, so re-running a sync
// updates in place and never duplicates.

import { getDb, COLLECTIONS } from './db.js';

export const META_COLLECTION = 'station_meta';

// ---------------------------------------------------------------------------
// Normalization
// ---------------------------------------------------------------------------

/** Normalize an IR station code, or return null when clearly malformed. */
export function normalizeStationCode(code) {
  if (code === null || code === undefined) return null;
  const s = String(code).trim().toUpperCase().replace(/\s+/g, '');
  return /^[A-Z][A-Z0-9]{1,4}$/.test(s) ? s : null;
}

/** Normalize a station name for storage/comparison. */
export function normalizeStationName(name) {
  if (name === null || name === undefined) return '';
  return String(name).trim().replace(/\s+/g, ' ');
}

/** Normalize a train number to bare digits, or null when malformed. */
export function normalizeTrainNumber(value) {
  if (value === null || value === undefined) return null;
  const s = String(value).trim().replace(/[^0-9]/g, '');
  return /^\d{4,6}$/.test(s) ? s : null;
}

/** Strip a MongoDB _id (and any other private fields) from a document. */
function publicDoc(doc) {
  if (!doc) return doc;
  const { _id, ...rest } = doc;
  return rest;
}

/**
 * Build an inclusion projection from a field whitelist.
 * `_id` is dropped so responses never expose internal identifiers, and
 * `synced_at`-style bookkeeping stays out of the public payload.
 */
function projectionOf(fields) {
  const projection = { _id: 0 };
  for (const field of fields) projection[field] = 1;
  return projection;
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ---------------------------------------------------------------------------
// Query parsing
// ---------------------------------------------------------------------------

export const MAX_LIMIT = 100;
export const DEFAULT_LIMIT = 20;

/**
 * Parse and clamp `page` / `limit`.
 * Page is 1-based. `limit=0` is honoured as "no limit" for back-compat with
 * the original /api/stations?limit=0 full-catalogue call.
 */
export function parsePagination(query = {}, { maxLimit = MAX_LIMIT, defaultLimit = DEFAULT_LIMIT } = {}) {
  const rawLimit = query.limit === undefined || query.limit === '' ? defaultLimit : Number(query.limit);
  if (!Number.isFinite(rawLimit) || rawLimit < 0) {
    return { error: `"limit" must be a non-negative integer (0 = no limit, max ${maxLimit})` };
  }
  const limit = Math.floor(rawLimit);

  const rawPage = query.page === undefined || query.page === '' ? 1 : Number(query.page);
  if (!Number.isFinite(rawPage) || rawPage < 1) {
    return { error: '"page" must be an integer >= 1' };
  }
  const page = Math.floor(rawPage);

  return { page, limit: limit === 0 ? 0 : Math.min(limit, maxLimit), noLimit: limit === 0 };
}

const SEARCH_MODES = new Set(['prefix', 'text']);

/**
 * Build a Mongo filter for a free-text catalogue query.
 *
 * `prefix` (default) is tuned for autocomplete:
 *   - code / train-number fields match on PREFIX, so "NDL" finds "NDLS" and the
 *     regular index on the code can still be used;
 *   - name / city / state fields match on CONTAINS, because users search
 *     "Delhi" expecting "New Delhi" and "Old Delhi", not just "Delhi...".
 *
 * `text` uses the collection text index for whole-word relevance ranking.
 */
export function buildSearchFilter(search, { codeFields = [], textFields = [] } = {}, mode = 'prefix') {
  const term = String(search || '').trim();
  if (!term) return {};

  if (!SEARCH_MODES.has(mode)) {
    return { __error: `"search_mode" must be one of: ${[...SEARCH_MODES].join(', ')}` };
  }

  if (mode === 'text') {
    return { $text: { $search: term } };
  }

  const safe = escapeRegExp(term);
  const clauses = [
    ...codeFields.map((field) => ({ [field]: new RegExp(`^${safe}`, 'i') })),
    ...textFields.map((field) => ({ [field]: new RegExp(safe, 'i') })),
  ];
  return clauses.length ? { $or: clauses } : {};
}

// ---------------------------------------------------------------------------
// Stations
// ---------------------------------------------------------------------------

const STATION_CODE_FIELDS = ['code'];
const STATION_TEXT_FIELDS = ['name', 'city', 'state', 'aliases'];
const STATION_FIELDS = [
  'code',
  'name',
  'city',
  'state',
  'zone',
  'division',
  'latitude',
  'longitude',
  'aliases',
  'is_core',
  'source',
  'synced_at',
];

/** Upsert station records keyed on `code`. Returns { inserted, updated }. */
export async function upsertStations(records) {
  if (!Array.isArray(records) || records.length === 0) return { inserted: 0, updated: 0 };
  const db = await getDb();
  // Stamped here, not in the record builder, so every refresh path (CLI, admin
  // API, future sources) records when the row was last confirmed upstream.
  const syncedAt = new Date();
  const result = await db.collection(COLLECTIONS.stations).bulkWrite(
    records.map((record) => ({
      updateOne: {
        filter: { code: record.code },
        update: { $set: { ...record, synced_at: syncedAt } },
        upsert: true,
      },
    })),
    { ordered: false },
  );
  return {
    inserted: result.upsertedCount || 0,
    updated: result.modifiedCount || 0,
  };
}

/**
 * Paginated station search by code / name / city / state / alias.
 * Core stations sort first so the map's CORE_STATIONS subset stays discoverable.
 */
export async function queryStations({ search, searchMode = 'prefix', page = 1, limit = DEFAULT_LIMIT } = {}) {
  const filter = buildSearchFilter(
    search,
    { codeFields: STATION_CODE_FIELDS, textFields: STATION_TEXT_FIELDS },
    searchMode,
  );
  if (filter.__error) return { error: filter.__error };

  const db = await getDb();
  const collection = db.collection(COLLECTIONS.stations);
  const total = await collection.countDocuments(filter);
  const useText = searchMode === 'text' && Boolean(search);

  let cursor = collection.find(filter, { projection: projectionOf(STATION_FIELDS) });
  cursor = useText
    ? cursor.sort({ score: { $meta: 'textScore' }, name: 1 })
    : cursor.sort({ is_core: -1, name: 1 });

  if (limit > 0) cursor = cursor.skip((page - 1) * limit).limit(limit);

  const data = (await cursor.toArray()).map(publicDoc);
  return {
    data,
    total,
    page,
    limit: limit === 0 ? total : limit,
    totalPages: limit > 0 ? Math.max(1, Math.ceil(total / limit)) : 1,
    hasMore: limit > 0 ? page * limit < total : false,
  };
}

/** Full station catalogue (code/name only), capped by limit (0 = all). */
export async function getCatalog(limit = 0) {
  const db = await getDb();
  let cursor = db
    .collection(COLLECTIONS.stations)
    .find({}, { projection: { _id: 0, code: 1, name: 1 } })
    .sort({ name: 1 });
  if (limit > 0) cursor = cursor.limit(Math.floor(limit));
  return cursor.toArray();
}

/** Convenience wrapper used by the original /api/stations/search handler. */
export async function searchStations(q, limit = 12) {
  const result = await queryStations({ search: q, page: 1, limit });
  if (result.error) throw new Error(result.error);
  return result.data;
}

export async function countStations() {
  const db = await getDb();
  return db.collection(COLLECTIONS.stations).countDocuments({});
}

export async function getStationByCode(code) {
  const normalized = normalizeStationCode(code);
  if (!normalized) return null;
  const db = await getDb();
  const doc = await db.collection(COLLECTIONS.stations).findOne({ code: normalized });
  return publicDoc(doc);
}

// ---------------------------------------------------------------------------
// Trains
// ---------------------------------------------------------------------------

const TRAIN_CODE_FIELDS = ['number'];
const TRAIN_TEXT_FIELDS = ['name', 'source_name', 'destination_name'];
const TRAIN_FIELDS = [
  'number',
  'name',
  'name_hindi',
  'type',
  'type_desc',
  'source_code',
  'source_name',
  'source_name_hindi',
  'destination_code',
  'destination_name',
  'destination_name_hindi',
  'days_of_run',
  'travel_time',
  'class_of_travel',
  'valid_from',
  'source',
  'synced_at',
];

/** Upsert train records keyed on `number`. Returns { inserted, updated }. */
export async function upsertTrains(records) {
  if (!Array.isArray(records) || records.length === 0) return { inserted: 0, updated: 0 };
  const db = await getDb();
  const syncedAt = new Date();
  const result = await db.collection(COLLECTIONS.trains).bulkWrite(
    records.map((record) => ({
      updateOne: {
        filter: { number: record.number },
        // $set never removes previously-enriched fields when a later, thinner
        // source (e.g. the bare RailRadar catalogue) is synced over them.
        update: { $set: { ...record, synced_at: syncedAt } },
        upsert: true,
      },
    })),
    { ordered: false },
  );
  return {
    inserted: result.upsertedCount || 0,
    updated: result.modifiedCount || 0,
  };
}

export async function queryTrains({ search, searchMode = 'prefix', page = 1, limit = DEFAULT_LIMIT } = {}) {
  const filter = buildSearchFilter(
    search,
    { codeFields: TRAIN_CODE_FIELDS, textFields: TRAIN_TEXT_FIELDS },
    searchMode,
  );
  if (filter.__error) return { error: filter.__error };

  const db = await getDb();
  const collection = db.collection(COLLECTIONS.trains);
  const total = await collection.countDocuments(filter);
  const useText = searchMode === 'text' && Boolean(search);

  let cursor = collection.find(filter, { projection: projectionOf(TRAIN_FIELDS) });
  cursor = useText
    ? cursor.sort({ score: { $meta: 'textScore' }, name: 1 })
    : cursor.sort({ number: 1 });

  if (limit > 0) cursor = cursor.skip((page - 1) * limit).limit(limit);

  const data = (await cursor.toArray()).map(publicDoc);
  return {
    data,
    total,
    page,
    limit: limit === 0 ? total : limit,
    totalPages: limit > 0 ? Math.max(1, Math.ceil(total / limit)) : 1,
    hasMore: limit > 0 ? page * limit < total : false,
  };
}

/** Single train by number, or null. */
export async function getTrainByNumber(number) {
  const normalized = normalizeTrainNumber(number);
  if (!normalized) return null;
  const db = await getDb();
  const doc = await db
    .collection(COLLECTIONS.trains)
    .findOne({ number: normalized }, { projection: projectionOf(TRAIN_FIELDS) });
  return doc || null;
}

export async function countTrains() {
  const db = await getDb();
  return db.collection(COLLECTIONS.trains).countDocuments({});
}

// ---------------------------------------------------------------------------
// Schedules (one document per train, stops embedded)
// ---------------------------------------------------------------------------

const SCHEDULE_FIELDS = [
  'train_number',
  'train_name',
  'train_name_hindi',
  'type',
  'type_desc',
  'source_code',
  'source_name',
  'destination_code',
  'destination_name',
  'days_of_run',
  'travel_time',
  'class_of_travel',
  'valid_from',
  'start_date',
  'valid_start_dates',
  'total_distance_km',
  'stops',
  'source',
];

/** Upsert schedule documents keyed on `train_number`. */
export async function upsertSchedules(records) {
  if (!Array.isArray(records) || records.length === 0) return { inserted: 0, updated: 0 };
  const db = await getDb();
  const result = await db.collection(COLLECTIONS.schedules).bulkWrite(
    records.map((record) => ({
      updateOne: {
        filter: { train_number: record.train_number },
        update: { $set: record },
        upsert: true,
      },
    })),
    { ordered: false },
  );
  return {
    inserted: result.upsertedCount || 0,
    updated: result.modifiedCount || 0,
  };
}

export async function getScheduleByTrainNumber(number) {
  const normalized = normalizeTrainNumber(number);
  if (!normalized) return null;
  const db = await getDb();
  const doc = await db
    .collection(COLLECTIONS.schedules)
    .findOne({ train_number: normalized }, { projection: projectionOf(SCHEDULE_FIELDS) });
  return doc || null;
}

export async function countSchedules() {
  const db = await getDb();
  return db.collection(COLLECTIONS.schedules).countDocuments({});
}

// ---------------------------------------------------------------------------
// Sync logs
// ---------------------------------------------------------------------------

/**
 * Open a sync_logs entry. Returns the created document so the caller can keep
 * mutating it and finally close it with finishSyncLog().
 */
export async function startSyncLog({ job, trigger = 'manual', meta = {} } = {}) {
  const db = await getDb();
  const doc = {
    job,
    trigger,
    status: 'running',
    started_at: new Date(),
    finished_at: null,
    duration_ms: null,
    counts: {},
    error: null,
    warnings: [],
    meta,
  };
  const result = await db.collection(COLLECTIONS.syncLogs).insertOne(doc);
  return { ...doc, _id: result.insertedId };
}

/** Close a sync_logs entry with its outcome. */
export async function finishSyncLog(log, { status, counts = {}, error = null, warnings = [] } = {}) {
  const db = await getDb();
  const finishedAt = new Date();
  const startedAt = log && log.started_at ? new Date(log.started_at) : finishedAt;
  await db.collection(COLLECTIONS.syncLogs).updateOne(
    { _id: log._id },
    {
      $set: {
        status,
        counts,
        error: error ? { message: error.message || String(error) } : null,
        warnings,
        finished_at: finishedAt,
        duration_ms: finishedAt.getTime() - startedAt.getTime(),
      },
    },
  );
  return { ...log, status, counts, error, warnings, finished_at: finishedAt };
}

/** Most recent sync runs, newest first. */
export async function listSyncLogs({ limit = 20, job } = {}) {
  const db = await getDb();
  const filter = job ? { job } : {};
  const docs = await db
    .collection(COLLECTIONS.syncLogs)
    .find(filter, { projection: { _id: 0 } })
    .sort({ started_at: -1 })
    .limit(Math.min(Math.max(1, Math.floor(limit) || 20), 100))
    .toArray();
  return docs;
}

export async function getLastSyncLog(job) {
  const db = await getDb();
  const doc = await db
    .collection(COLLECTIONS.syncLogs)
    .findOne({ job, status: { $ne: 'running' } }, { projection: { _id: 0 }, sort: { started_at: -1 } });
  return publicDoc(doc);
}

// ---------------------------------------------------------------------------
// Legacy sync metadata (station_meta) - kept so the original sync script's
// counters stay readable.
// ---------------------------------------------------------------------------

export async function setMeta(key, value) {
  const db = await getDb();
  return db.collection(META_COLLECTION).updateOne({ key }, { $set: { key, value } }, { upsert: true });
}

export async function getMetaObject() {
  const db = await getDb();
  const rows = await db.collection(META_COLLECTION).find({}, { projection: { _id: 0, key: 1, value: 1 } }).toArray();
  const meta = {};
  for (const row of rows) meta[row.key] = row.value;
  return meta;
}
