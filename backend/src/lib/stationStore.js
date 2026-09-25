// RailBuddy station catalogue store.
// Single canonical, persistent MongoDB catalogue of REAL Indian Railways
// stations, populated from the legit RailRadar /lookup/stations directory
// (13,005 entries) via backend/scripts/sync-stations.mjs. Nothing is
// invented: code/name/city/state/coords exist only when a real source
// provides them.
//
// Store API (all imports below are used by routes/stations.js and
// scripts/sync-stations.mjs):
//   openStore, closeStore, upsertStations, searchStations, getCatalog,
//   countStations, setMeta, getMetaObject, normalizeStationCode,
//   normalizeStationName, META_SOURCE ... META_DUPLICATES
//
// Requires a running MongoDB and a MONGODB_URI in backend/.env
// (defaults to mongodb://127.0.0.1:27017/railbuddy).
//
// This file is deliberately ASCII-only; run `node backend/scripts/sync-stations.mjs`.

import { MongoClient } from 'mongodb';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const STATIONS_COLLECTION = 'stations';
const META_COLLECTION = 'station_meta';

// Read lazily so `dotenv.config()` in consuming modules (e.g. the sync script,
// where ESM imports evaluate before the module body) runs first.
function mongoUri() {
  return process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017';
}

function databaseName(uri) {
  try {
    const pathname = new URL(uri).pathname;
    const name = pathname && pathname.replace(/^\//, '').replace(/\/$/, '');
    return name || 'railbuddy';
  } catch {
    return 'railbuddy';
  }
}

// ---------------------------------------------------------------------------
// Meta keys (kept in step with scripts/sync-stations.mjs)
// ---------------------------------------------------------------------------

export const META_SOURCE = 'source';
export const META_IMPORTED_AT = 'imported_at';
export const META_UPDATED_AT = 'updated_at';
export const META_TOTAL = 'total';
export const META_CORE = 'core';
export const META_ENRICHED = 'enriched';
export const META_INVALID = 'invalid';
export const META_DUPLICATES = 'duplicates';

// ---------------------------------------------------------------------------
// Connection state
// ---------------------------------------------------------------------------

let client = null;
let db = null;
let connecting = null;

async function ensureConnected() {
  if (connected()) return db;
  if (!connecting) {
    connecting = (async () => {
      const uri = mongoUri();
      const mongo = new MongoClient(uri, {
        serverSelectionTimeoutMS: 5000,
      });
      await mongo.connect();
      const database = mongo.db(databaseName(uri));
      const stations = database.collection(STATIONS_COLLECTION);
      await stations.createIndex({ code: 1 }, { unique: true });
      await database.collection(META_COLLECTION).createIndex({ key: 1 }, { unique: true });
      client = mongo;
      db = database;
      return db;
    })().finally(() => {
      connecting = null;
    });
  }
  return connecting;
}

function connected() {
  return Boolean(client && db);
}

/** Open (lazily) and warm up the MongoDB connection. Idempotent. */
export async function openStore() {
  return ensureConnected();
}

/** Close the MongoDB connection and release the store. */
export async function closeStore() {
  if (connecting) {
    await connecting;
  }
  if (client) {
    await client.close();
  }
  client = null;
  db = null;
}

// ---------------------------------------------------------------------------
// Station helpers
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

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ---------------------------------------------------------------------------
// Write API
// ---------------------------------------------------------------------------

/**
 * Upsert a batch of station records (keyed by code).
 * Returns { inserted, updated } mirroring the old sync counters.
 */
export async function upsertStations(records) {
  const database = await ensureConnected();
  const stations = database.collection(STATIONS_COLLECTION);

  if (!Array.isArray(records) || records.length === 0) {
    return { inserted: 0, updated: 0 };
  }

  const operations = records.map((record) => ({
    updateOne: {
      filter: { code: record.code },
      update: { $set: record },
      upsert: true,
    },
  }));

  const result = await stations.bulkWrite(operations, { ordered: false });
  return {
    inserted: result.upsertedCount || 0,
    updated: result.modifiedCount || 0,
  };
}

// ---------------------------------------------------------------------------
// Read API
// ---------------------------------------------------------------------------

/**
 * Search the station catalogue by code, name, city or state.
 * limit caps the result; pass 0/undefined for no limit.
 */
export async function searchStations(q, limit = 12) {
  const database = await ensureConnected();
  const stations = database.collection(STATIONS_COLLECTION);

  const needle = String(q || '').trim();
  if (!needle) return getCatalog(limit);

  const regex = new RegExp(escapeRegExp(needle), 'i');
  const filter = { $or: [{ code: regex }, { name: regex }, { city: regex }, { state: regex }] };

  let cursor = stations
    .find(filter, { projection: { _id: 0 } })
    .sort({ is_core: -1, name: 1 });
  if (limit > 0) cursor = cursor.limit(Math.floor(limit));
  return cursor.toArray();
}

/** Full station catalogue (code/name only), capped by limit (0 = all). */
export async function getCatalog(limit = 0) {
  const database = await ensureConnected();
  const stations = database.collection(STATIONS_COLLECTION);

  let cursor = stations
    .find({}, { projection: { _id: 0, code: 1, name: 1 } })
    .sort({ name: 1 });
  if (limit > 0) cursor = cursor.limit(Math.floor(limit));
  return cursor.toArray();
}

/** Total number of stored stations. */
export async function countStations() {
  const database = await ensureConnected();
  return database.collection(STATIONS_COLLECTION).countDocuments({});
}

// ---------------------------------------------------------------------------
// Sync metadata
// ---------------------------------------------------------------------------

/** Persist a key/value sync metadata entry (upserted by key). */
export async function setMeta(key, value) {
  const database = await ensureConnected();
  return database
    .collection(META_COLLECTION)
    .updateOne({ key }, { $set: { key, value } }, { upsert: true });
}

/** All sync metadata as a plain { key: value } object. */
export async function getMetaObject() {
  const database = await ensureConnected();
  const rows = await database
    .collection(META_COLLECTION)
    .find({}, { projection: { _id: 0, key: 1, value: 1 } })
    .toArray();
  const meta = {};
  for (const row of rows) meta[row.key] = row.value;
  return meta;
}