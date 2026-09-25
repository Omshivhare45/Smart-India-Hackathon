#!/usr/bin/env node
/**
 * RailBuddy Station Catalogue — import / sync script.
 *
 * Builds the canonical COMPLETE_STATION_CATALOGUE (MongoDB) from a legitimate
 * source: the RailRadar `/lookup/stations` directory (13k+ real IR stations),
 * enriched with city/state for the 37 stations in the in-repo catalog
 * (`ml/data/catalog.json`, itself extracted from src/data/trainData.ts).
 *
 * No station names, codes, or coordinates are invented.
 *
 * Usage (from repository root):
 *   node backend/scripts/sync-stations.mjs            # sync + report
 *   node backend/scripts/sync-stations.mjs --dry-run  # validate without writing
 *
 * Repeatable: run any time you want to refresh the catalogue.
 */

import dotenv from 'dotenv';
import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  openStore,
  closeStore,
  upsertStations,
  countStations,
  setMeta,
  normalizeStationCode,
  normalizeStationName,
  META_SOURCE,
  META_IMPORTED_AT,
  META_UPDATED_AT,
  META_TOTAL,
  META_CORE,
  META_ENRICHED,
  META_INVALID,
  META_DUPLICATES,
} from '../src/lib/stationStore.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '../.env') });

const API_KEY = process.env.RAILRADAR_API_KEY || '';
const REPO_ROOT = resolve(__dirname, '../..');
const BACKEND_ROOT = resolve(__dirname, '..');

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');

// Guard lives at the top of run() (top-level `return` is illegal in ESM).


const STATIONS_URL = 'https://api.railradar.in/v1/lookup/stations';

// ---------------------------------------------------------------------------
// Source 1: RailRadar real station directory (code -> name)
// ---------------------------------------------------------------------------
async function fetchRailRadarDirectory() {
  console.log('• Fetching RailRadar station directory…');
  const res = await fetch(STATIONS_URL, {
    headers: { Authorization: `Bearer ${API_KEY}`, Accept: 'application/json' },
  });
  if (!res.ok) {
    throw new Error(`RailRadar /lookup/stations failed: HTTP ${res.status} ${res.statusText}`);
  }
  const data = await res.json();
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('RailRadar returned an invalid station directory (expected code→name map).');
  }
  const entries = Object.entries(data);
  console.log(`  → fetched ${entries.length.toLocaleString()} station entries from RailRadar.`);
  return entries;
}

// ---------------------------------------------------------------------------
// Source 2: in-repo seed catalog enrichment (city/state for 37 core stations)
// ---------------------------------------------------------------------------
async function loadEnrichmentCatalog() {
  try {
    const raw = await readFile(resolve(REPO_ROOT, 'ml/data/catalog.json'), 'utf8');
    const parsed = JSON.parse(raw);
    const stations = Array.isArray(parsed) ? parsed : parsed?.stations;
    if (!Array.isArray(stations)) return new Map();
    const map = new Map();
    for (const s of stations) {
      const code = normalizeStationCode(s.code);
      if (!code) continue;
      map.set(code, {
        city: s.city || null,
        state: s.state || null,
        source: 'catalog',
      });
    }
    console.log(`  → enrichment catalog provides city/state for ${map.size} core stations.`);
    return map;
  } catch (err) {
    console.warn(`  ⚠ enrichment catalog not loaded (${err.message}); continuing without city/state.`);
    return new Map();
  }
}

// ---------------------------------------------------------------------------
// Build normalized records
// ---------------------------------------------------------------------------
function buildRecords(entries, enrichment) {
  const byCode = new Map();
  let invalid = 0;
  let requestDupes = 0;
  let enriched = 0;

  for (const [code, name] of entries) {
    const normCode = normalizeStationCode(code);
    if (!normCode) {
      invalid += 1;
      console.warn(`  ⚠ invalid station code skipped: "${code}"`);
      continue;
    }
    if (!String(name || '').trim()) {
      invalid += 1;
      console.warn(`  ⚠ station with empty name skipped: "${code}"`);
      continue;
    }
    if (byCode.has(normCode)) {
      requestDupes += 1;
      continue;
    }

    const enrichmentData = enrichment.get(normCode);
    const record = {
      code: normCode,
      name: String(name).trim(),
      city: enrichmentData?.city ?? null,
      state: enrichmentData?.state ?? null,
      latitude: null, // not available from the legitimate source — do not invent
      longitude: null, // not available from the legitimate source — do not invent
      zone: null,
      division: null,
      aliases: null,
      is_core: enrichmentData ? true : false,
      source: enrichmentData ? 'railradar+catalog' : 'railradar',
    };
    byCode.set(normCode, record);
    if (enrichmentData) enriched += 1;
  }

  // Enrichment codes present in catalog.json but missing from RailRadar
  // (upstream drift) are reported, never silently inserted.
  const missingFromRadar = [];
  for (const code of enrichment.keys()) {
    if (!byCode.has(code)) missingFromRadar.push(code);
  }

  return { records: [...byCode.values()], invalid, duplicates: requestDupes, enriched, missingFromRadar };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  await openStore();

  const entries = await fetchRailRadarDirectory();
  const enrichment = await loadEnrichmentCatalog();
  const { records, invalid, duplicates, enriched, missingFromRadar } = buildRecords(entries, enrichment);

  const before = await countStations();

  if (DRY_RUN) {
    console.log('\n── DRY RUN (no database changes) ─────────────────────────');
  }

  const { inserted, updated } = DRY_RUN ? { inserted: 0, updated: 0 } : await upsertStations(records);

  if (!DRY_RUN) {
    const importedAt = new Date().toISOString();
    await setMeta(META_SOURCE, 'RailRadar /lookup/stations + in-repo catalog.json enrichment');
    await setMeta(META_IMPORTED_AT, importedAt);
    await setMeta(META_UPDATED_AT, importedAt);
    await setMeta(META_TOTAL, String(records.length));
    await setMeta(META_CORE, String(enriched));
    await setMeta(META_ENRICHED, String(enriched));
    await setMeta(META_INVALID, String(invalid));
    await setMeta(META_DUPLICATES, String(duplicates));
  }

  const after = DRY_RUN ? before : await countStations();

  console.log('\n── Station Catalogue Sync Summary ─────────────────────────');
  console.log(`  source           : ${DRY_RUN ? '(dry run)' : 'RailRadar /lookup/stations + catalog.json'}`);
  console.log(`  total (catalog)  : ${after.toLocaleString()} stations`);
  if (before !== after) console.log(`  previous total   : ${before.toLocaleString()} stations`);
  console.log(`  inserted         : ${inserted.toLocaleString()}`);
  console.log(`  updated          : ${updated.toLocaleString()}`);
  console.log(`  duplicates       : ${duplicates.toLocaleString()} (normalized to same code in source)`);
  console.log(`  invalid          : ${invalid.toLocaleString()}`);
  console.log(`  enriched (core)  : ${enriched.toLocaleString()} (city/state from catalog.json)`);
  if (missingFromRadar.length) {
    console.log(`  ⚠ enrichment codes missing from RailRadar: ${missingFromRadar.join(', ')}`);
  }
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  await closeStore();
}

function run() {
  if (!API_KEY) {
    console.error('✖ RAILRADAR_API_KEY is not set in backend/.env — cannot fetch the real station catalogue.');
    process.exitCode = 1;
    return;
  }
  main().catch((err) => {
    console.error('\n✖ Sync failed:', err.message);
    closeStore();
    process.exitCode = 1;
  });
}

run();