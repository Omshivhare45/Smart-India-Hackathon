// RailBuddy MongoDB connection + index management.
//
// One shared MongoClient for the whole process (stations, trains, schedules,
// sync_logs). Connects lazily so importing this module never blocks, and so
// `dotenv.config()` in the entry point runs before MONGODB_URI is read.
//
// MONGODB_URI accepts a local mongod (mongodb://127.0.0.1:27017/railbuddy) or
// a MongoDB Atlas SRV string
// (mongodb+srv://user:pass@cluster.mongodb.net/railbuddy?retryWrites=true&w=majority).
// The database name is taken from the URI path when present, otherwise
// DEFAULT_DB_NAME is used.

import { MongoClient } from 'mongodb';

export const COLLECTIONS = {
  stations: 'stations',
  trains: 'trains',
  schedules: 'schedules',
  syncLogs: 'sync_logs',
};

const DEFAULT_DB_NAME = 'railbuddy';
const SERVER_SELECTION_TIMEOUT_MS = 8000;

let client = null;
let db = null;
let connecting = null;
let indexesReady = null;

/** Read MONGODB_URI lazily so dotenv has already populated process.env. */
export function mongoUri() {
  return process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017';
}

/**
 * Extract the database name from a connection string.
 * `new URL()` is avoided because mongodb+srv is not a special scheme, so
 * pathname parsing is unreliable across Node versions; a regex is exact.
 */
export function databaseNameFromUri(uri) {
  const withoutQuery = String(uri || '').split('?')[0];
  const afterScheme = withoutQuery.replace(/^mongodb(\+srv)?:\/\//i, '');
  const afterHost = afterScheme.slice(afterScheme.indexOf('@') + 1);
  const slash = afterHost.indexOf('/');
  if (slash === -1) return DEFAULT_DB_NAME;
  const name = decodeURIComponent(afterHost.slice(slash + 1)).replace(/\/+$/, '');
  return name || DEFAULT_DB_NAME;
}

function connected() {
  return Boolean(client && db);
}

async function ensureConnected() {
  if (connected()) return db;
  if (!connecting) {
    connecting = (async () => {
      const uri = mongoUri();
      const mongo = new MongoClient(uri, {
        serverSelectionTimeoutMS: SERVER_SELECTION_TIMEOUT_MS,
      });
      await mongo.connect();
      client = mongo;
      db = mongo.db(databaseNameFromUri(uri));
      return db;
    })().finally(() => {
      connecting = null;
    });
  }
  return connecting;
}

/** Open (lazily) the connection. Idempotent. */
export async function getDb() {
  return ensureConnected();
}

/** Close the connection and reset module state. */
export async function closeDb() {
  if (connecting) {
    await connecting.catch(() => {});
  }
  if (client) {
    await client.close().catch(() => {});
  }
  client = null;
  db = null;
  indexesReady = null;
}

/** True when a live connection is currently held. */
export function isConnected() {
  return connected();
}

// ---------------------------------------------------------------------------
// Indexes
// ---------------------------------------------------------------------------

/**
 * The name the driver derives for a key pattern, e.g. `{ is_core: -1, name: 1 }`
 * -> `is_core_-1_name_1`. Exported so specs and tests share one definition.
 */
export function defaultIndexName(key) {
  return Object.keys(key)
    .map((field) => `${field}_${key[field]}`)
    .join('_');
}

/** Stable, order-independent fingerprint of a key pattern. */
function keySignature(key) {
  return Object.keys(key)
    .sort()
    .map((field) => `${field}:${key[field]}`)
    .join('|');
}

function isTextSpec(spec) {
  return Object.values(spec.key).includes('text');
}

/**
 * A live text index reports `_fts`; there can only ever be one per collection.
 */
function liveTextIndex(liveIndexes) {
  return liveIndexes.find((ix) => ix.key && ix.key._fts === 'text') || null;
}

/**
 * `listIndexes` on a collection that has never been written to fails with
 * NamespaceNotFound (code 26), which is the normal state of a cold database —
 * the very thing `connectWithIndexes` is meant to self-heal. Treat it as
 * "no indexes yet" so the first pass creates them.
 */
async function listIndexesOrEmpty(target) {
  try {
    return await target.listIndexes().toArray();
  } catch (err) {
    if (err && (err.code === 26 || err.codeName === 'NamespaceNotFound')) return [];
    throw err;
  }
}

/** Declared text weights must match the live ones, or the index is not the same. */
function textWeightsMatch(spec, live) {
  const declared = spec.options?.weights || {};
  const actual = live.weights || {};
  const declaredFields = Object.keys(declared);
  const actualFields = Object.keys(actual);
  if (declaredFields.length !== actualFields.length) return false;
  return declaredFields.every((field) => actual[field] === declared[field]);
}

/**
 * Every index the catalogue relies on.
 *
 * Unique indexes enforce the "one document per identity" invariant that makes
 * re-running a sync idempotent (stations.code, trains.number,
 * schedules.train_number). Each collection gets exactly one text index, as
 * MongoDB permits only one per collection.
 *
 * Names are the canonical driver names for the key pattern (`code_1`,
 * `is_core_-1_name_1`, ...), not arbitrary labels. MongoDB identifies an index
 * by its key pattern, so asking for `{ code: 1 }` under a different name than
 * the one already stored is rejected with "Index already exists with a
 * different name" on every single startup. Declaring the canonical name keeps
 * `createIndex` a true no-op against both this database and any older one that
 * was seeded without explicit names.
 */
export const INDEX_SPECS = {
  [COLLECTIONS.stations]: [
    { name: 'code_1', key: { code: 1 }, options: { unique: true } },
    { name: 'name_1', key: { name: 1 } },
    { name: 'is_core_-1_name_1', key: { is_core: -1, name: 1 } },
    {
      name: 'text_idx',
      key: { name: 'text', code: 'text', city: 'text', state: 'text', aliases: 'text' },
      options: {
        weights: { name: 10, code: 10, aliases: 6, city: 4, state: 2 },
        name: 'text_idx',
      },
    },
  ],
  [COLLECTIONS.trains]: [
    { name: 'number_1', key: { number: 1 }, options: { unique: true } },
    { name: 'name_1', key: { name: 1 } },
    { name: 'source_code_1_destination_code_1', key: { source_code: 1, destination_code: 1 } },
    {
      name: 'text_idx',
      key: { name: 'text', number: 'text', source_name: 'text', destination_name: 'text' },
      options: {
        weights: { number: 10, name: 10, source_name: 3, destination_name: 3 },
        name: 'text_idx',
      },
    },
  ],
  [COLLECTIONS.schedules]: [
    { name: 'train_number_1', key: { train_number: 1 }, options: { unique: true } },
    { name: 'train_name_1', key: { train_name: 1 } },
    { name: 'source_code_1_destination_code_1', key: { source_code: 1, destination_code: 1 } },
  ],
  [COLLECTIONS.syncLogs]: [
    { name: 'job_1_started_at_-1', key: { job: 1, started_at: -1 } },
    { name: 'started_at_-1', key: { started_at: -1 } },
  ],
};

/**
 * Bring one collection in line with `specs`, without ever dropping or renaming
 * an index. For every spec we:
 *   1. reuse the index that already carries the same key pattern (adopting its
 *      name, whatever it is) — this is the path that silences the
 *      "already exists with a different name" rejections;
 *   2. otherwise create it under the declared name.
 * A genuine definition clash (same name, different key, or a missing `unique`
 * that we depend on) is reported instead of being "fixed" by dropping data.
 */
async function ensureCollectionIndexes(database, collection, specs) {
  const target = database.collection(collection);
  const liveIndexes = await listIndexesOrEmpty(target);
  const liveByName = new Map(liveIndexes.map((ix) => [ix.name, ix]));
  const liveText = liveTextIndex(liveIndexes);

  const ensured = [];
  const adopted = [];
  const conflicts = [];

  for (const spec of specs) {
    const name = spec.name || defaultIndexName(spec.key);
    const wantsUnique = Boolean(spec.options?.unique);

    if (isTextSpec(spec)) {
      if (!liveText) {
        ensured.push(name);
        await target.createIndex(spec.key, { ...(spec.options || {}), name });
        continue;
      }
      if (liveText.name !== name || !textWeightsMatch(spec, liveText)) {
        conflicts.push(
          `${collection}.${name}: a text index already exists as ${liveText.name} ` +
            `(weights ${JSON.stringify(liveText.weights || {})}); a collection can only have one`,
        );
        ensured.push(liveText.name);
        continue;
      }
      ensured.push(liveText.name);
      continue;
    }

    // Same key pattern already present under any name -> adopt, never recreate.
    const sameKey = liveIndexes.find((ix) => keySignature(ix.key) === keySignature(spec.key));
    if (sameKey) {
      if (wantsUnique && !sameKey.unique) {
        conflicts.push(
          `${collection}.${sameKey.name} indexes ${JSON.stringify(spec.key)} but is not unique; ` +
            `the sync relies on a unique index here - reconcile it manually`,
        );
      }
      if (sameKey.name !== name) {
        adopted.push({ declared: name, existing: sameKey.name, collection });
      }
      ensured.push(sameKey.name);
      continue;
    }

    // Nothing equivalent: the name may still be taken by a different index.
    if (liveByName.has(name)) {
      conflicts.push(
        `${collection}.${name} is taken by an index on ${JSON.stringify(liveByName.get(name).key)}; ` +
          `cannot create the ${JSON.stringify(spec.key)} index under that name`,
      );
      continue;
    }

    ensured.push(name);
    await target.createIndex(spec.key, { ...(spec.options || {}), name });
  }

  return { ensured, adopted, conflicts };
}

/**
 * Create every index above. Safe to call repeatedly and across restarts:
 * equivalent indexes already in the database are adopted as-is, so
 * `createIndex` only ever runs for genuinely missing definitions.
 * Returns a per-collection list of the index names now in place.
 */
export async function ensureIndexes() {
  if (indexesReady) return indexesReady;
  indexesReady = (async () => {
    const database = await ensureConnected();
    const created = {};
    const adopted = [];
    const conflicts = [];
    for (const [collection, specs] of Object.entries(INDEX_SPECS)) {
      const result = await ensureCollectionIndexes(database, collection, specs).catch((err) => {
        // An index that cannot be created must not take the whole service down.
        conflicts.push(`${collection}: ${err.message}`);
        return { ensured: [], adopted: [], conflicts: [] };
      });
      created[collection] = result.ensured;
      adopted.push(...result.adopted);
      conflicts.push(...result.conflicts);
    }
    for (const item of adopted) {
      console.log(`[db] ${item.collection}: keeping existing index ${item.existing} (declared ${item.declared})`);
    }
    for (const message of conflicts) {
      console.warn(`[db] index conflict — ${message}`);
    }
    return created;
  })().catch((err) => {
    indexesReady = null;
    throw err;
  });
  return indexesReady;
}

/**
 * Connect and make sure indexes exist. Called on server start and by the sync
 * scripts so a cold database is self-healing.
 */
export async function connectWithIndexes() {
  await ensureConnected();
  return ensureIndexes();
}

/** Collection counts, for /api/health and sync reporting. */
export async function collectionCounts() {
  const database = await ensureConnected();
  const entries = await Promise.all(
    Object.entries(COLLECTIONS).map(async ([key, name]) => [
      key,
      await database.collection(name).countDocuments({}),
    ]),
  );
  return Object.fromEntries(entries);
}
