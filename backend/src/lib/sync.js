// RailBuddy catalogue synchronization.
//
// Shared by the CLI (backend/scripts/sync-catalog.mjs) and the admin endpoint
// (POST /api/admin/sync) so both behave identically.
//
// Safety properties, in priority order:
//   1. NEVER fabricate data. A field is written only when a real upstream
//      supplied it; everything else is null.
//   2. NEVER lose data on failure. The full record set is fetched, validated and
//      built in memory first; the database is touched only once that succeeds.
//      Writes are upserts keyed on the identity field, and nothing is ever
//      deleted, so a truncated or partial upstream response can shrink the
//      catalogue but cannot empty it.
//   3. ALWAYS leave an audit trail. Every run writes a sync_logs row with
//      status, timestamps, counts and any error.
//
// Sources (both verified against the live APIs on 2026-09-26):
//   stations  RailRadar GET /v1/lookup/stations  -> { code: name }, 13,005 rows
//   trains    RailRadar GET /v1/lookup/trains    -> { number: name }
//
// Neither endpoint paginates: they return the whole directory in one response
// and ignore limit/page. Schedules are NOT synced here - they come from NTES
// via ml/scripts/sync_ntes.py, which needs the Python runtime.

import { APIError } from './errors.js';
import { getTrainCatalog, getStationCatalog, railradarConfigured } from './railradar.js';
import { connectWithIndexes, closeDb, collectionCounts } from './db.js';
import {
  upsertStations,
  upsertTrains,
  normalizeStationCode,
  normalizeStationName,
  normalizeTrainNumber,
  startSyncLog,
  finishSyncLog,
  countStations,
  countTrains,
} from './catalogStore.js';

// Only one sync may run at a time; a second caller gets a clear 409.
let running = false;

export function syncInProgress() {
  return running;
}

/**
 * Turn a provider error into something an operator can act on.
 * RailRadar meters 10 req/min and 1000 req/month and says which window is
 * exhausted in the 429 body.
 */
function describeUpstreamError(err) {
  if (err instanceof APIError) {
    if (err.code === 'RATE_LIMITED') {
      return `${err.message} (RailRadar allows 10 requests/minute and 1000/month; a sync costs 2)`;
    }
    if (err.code === 'INVALID_API_KEY') {
      return 'RAILRADAR_API_KEY is missing or invalid - set it in backend/.env';
    }
    return `${err.code}: ${err.message}`;
  }
  return err && err.message ? err.message : String(err);
}

// ---------------------------------------------------------------------------
// Stations
// ---------------------------------------------------------------------------

/**
 * Build normalized station documents from the RailRadar directory.
 * Returns the records plus the validation counters so the caller can report
 * exactly what was rejected instead of silently dropping rows.
 */
export function buildStationRecords(entries) {
  const records = [];
  const byCode = new Map();
  let invalidCode = 0;
  let emptyName = 0;
  let duplicates = 0;
  const rejectedSamples = [];

  for (const [rawCode, rawName] of entries) {
    const code = normalizeStationCode(rawCode);
    if (!code) {
      invalidCode += 1;
      if (rejectedSamples.length < 10) rejectedSamples.push(`code=${JSON.stringify(rawCode)}`);
      continue;
    }
    const name = normalizeStationName(rawName);
    if (!name) {
      emptyName += 1;
      if (rejectedSamples.length < 10) rejectedSamples.push(`${code} (empty name)`);
      continue;
    }
    if (byCode.has(code)) {
      duplicates += 1;
      continue;
    }

    // Only code and name come from RailRadar. Latitude/longitude, zone, city and
    // state are left null here on purpose: the provider does not supply them,
    // and a separate enrichment pass may fill them in later.
    const record = {
      code,
      name,
      city: null,
      state: null,
      zone: null,
      division: null,
      latitude: null,
      longitude: null,
      aliases: null,
      is_core: false,
      source: 'railradar:/lookup/stations',
    };
    byCode.set(code, record);
    records.push(record);
  }

  return {
    records,
    stats: {
      received: entries.length,
      accepted: records.length,
      invalid_code: invalidCode,
      empty_name: emptyName,
      duplicates,
      rejected_samples: rejectedSamples,
    },
  };
}

/** Fetch and upsert the full station directory. */
export async function syncStations({ dryRun = false } = {}) {
  const entries = await getStationCatalog(0);
  const { records, stats } = buildStationRecords(entries);

  const before = await countStations();
  const result = dryRun ? { inserted: 0, updated: 0 } : await upsertStations(records);
  const after = dryRun ? before : await countStations();

  return {
    source: 'railradar:/lookup/stations',
    dry_run: dryRun,
    before,
    after,
    ...result,
    stats,
  };
}

// ---------------------------------------------------------------------------
// Trains
// ---------------------------------------------------------------------------

/**
 * Build normalized train documents from the RailRadar train directory.
 * The provider only yields { number: name }, so type/route/days-of-run stay
 * null until ml/scripts/sync_ntes.py enriches them. The upsert uses $set only,
 * so a later thinner sync never erases previously enriched fields.
 */
export function buildTrainRecords(entries) {
  const records = [];
  const byNumber = new Map();
  let invalidNumber = 0;
  let emptyName = 0;
  let duplicates = 0;
  const rejectedSamples = [];

  for (const [rawNumber, rawName] of entries) {
    const number = normalizeTrainNumber(rawNumber);
    if (!number) {
      invalidNumber += 1;
      if (rejectedSamples.length < 10) rejectedSamples.push(`number=${JSON.stringify(rawNumber)}`);
      continue;
    }
    const name = normalizeStationName(rawName);
    if (!name) {
      emptyName += 1;
      if (rejectedSamples.length < 10) rejectedSamples.push(`${number} (empty name)`);
      continue;
    }
    if (byNumber.has(number)) {
      duplicates += 1;
      continue;
    }

    const record = {
      number,
      name,
      name_hindi: null,
      type: null,
      type_desc: null,
      source_code: null,
      source_name: null,
      destination_code: null,
      destination_name: null,
      days_of_run: null,
      travel_time: null,
      class_of_travel: null,
      valid_from: null,
      source: 'railradar:/lookup/trains',
    };
    byNumber.set(number, record);
    records.push(record);
  }

  return {
    records,
    stats: {
      received: entries.length,
      accepted: records.length,
      invalid_number: invalidNumber,
      empty_name: emptyName,
      duplicates,
      rejected_samples: rejectedSamples,
    },
  };
}

/** Fetch and upsert the full train directory. */
export async function syncTrains({ dryRun = false } = {}) {
  const entries = await getTrainCatalog();
  const { records, stats } = buildTrainRecords(entries);

  const before = await countTrains();
  const result = dryRun ? { inserted: 0, updated: 0 } : await upsertTrains(records);
  const after = dryRun ? before : await countTrains();

  return {
    source: 'railradar:/lookup/trains',
    dry_run: dryRun,
    before,
    after,
    ...result,
    stats,
  };
}

// ---------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------

/**
 * Run the RailRadar catalogue sync end to end.
 *
 * `targets` selects which catalogues to refresh: ['stations'], ['trains'] or
 * both. Each target is synced independently so a quota failure on one does not
 * discard the other's work; the run is only marked 'failed' when every selected
 * target failed, and 'partial' when some succeeded.
 */
export async function syncCatalog({ targets = ['stations', 'trains'], dryRun = false, trigger = 'manual' } = {}) {
  if (running) {
    const err = new Error('A catalogue sync is already running.');
    err.status = 409;
    err.code = 'SYNC_IN_PROGRESS';
    throw err;
  }
  if (!railradarConfigured()) {
    const err = new Error('RAILRADAR_API_KEY is not configured; cannot sync the catalogue.');
    err.status = 401;
    err.code = 'INVALID_API_KEY';
    throw err;
  }

  running = true;
  const selected = targets.filter((t) => t === 'stations' || t === 'trains');
  const log = await startSyncLog({ job: 'railradar-catalogue', trigger, meta: { targets: selected, dry_run: dryRun } });

  const counts = {};
  const warnings = [];
  const results = {};
  const errors = {};

  try {
    await connectWithIndexes();

    for (const target of selected) {
      try {
        const result = target === 'stations' ? await syncStations({ dryRun }) : await syncTrains({ dryRun });
        results[target] = result;
        counts[target] = {
          received: result.stats.received,
          accepted: result.stats.accepted,
          inserted: result.inserted,
          updated: result.updated,
          total_after: result.after,
        };
        if (result.stats.invalid_code || result.stats.invalid_number || result.stats.empty_name) {
          warnings.push(
            `${target}: rejected ${result.stats.invalid_code + result.stats.invalid_number} malformed code(s) ` +
              `and ${result.stats.empty_name} empty name(s)`,
          );
        }
      } catch (err) {
        // One target failing must not roll back or skip the other.
        errors[target] = describeUpstreamError(err);
        warnings.push(`${target}: ${errors[target]}`);
      }
    }

    const succeeded = Object.keys(results);
    const status = succeeded.length === 0 ? 'failed' : succeeded.length === selected.length ? 'success' : 'partial';

    counts.totals = await collectionCounts();
    const finished = await finishSyncLog(log, {
      status,
      counts,
      error: succeeded.length === 0 ? new Error(Object.values(errors).join('; ')) : null,
      warnings,
    });

    return {
      status,
      dry_run: dryRun,
      targets: selected,
      counts,
      warnings,
      errors,
      results,
      log: finished,
    };
  } catch (err) {
    await finishSyncLog(log, { status: 'failed', counts, error: err, warnings });
    throw err;
  } finally {
    running = false;
  }
}

/** Close the shared Mongo connection (CLI convenience). */
export async function shutdownSync() {
  await closeDb();
}
