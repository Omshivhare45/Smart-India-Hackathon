#!/usr/bin/env node
/**
 * RailBuddy catalogue sync (RailRadar bulk directories -> MongoDB).
 *
 * Refreshes the `stations` and `trains` collections from the two verified
 * RailRadar bulk endpoints and writes a `sync_logs` row for every run.
 *
 * Usage (from the repository root):
 *   node backend/scripts/sync-catalog.mjs                 # stations + trains
 *   node backend/scripts/sync-catalog.mjs --stations      # stations only
 *   node backend/scripts/sync-catalog.mjs --trains        # trains only
 *   node backend/scripts/sync-catalog.mjs --dry-run       # validate, write nothing
 *   node backend/scripts/sync-catalog.mjs --indexes-only  # just create indexes
 *
 * Cost: 2 RailRadar requests per full run. The plan allows 10/minute and
 * 1000/month, so a full sync is cheap - but the monthly ceiling is shared with
 * the live-tracking and map endpoints, so prefer one run per change rather than
 * a tight loop.
 *
 * Schedules are NOT handled here: they come from NTES via
 * `python ml/scripts/sync_ntes.py`, which needs the Python runtime.
 */

import dotenv from 'dotenv';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { syncCatalog, shutdownSync } from '../src/lib/sync.js';
import { connectWithIndexes, collectionCounts } from '../src/lib/db.js';
import { railradarConfigured, RAILRADAR_BASE_URL } from '../src/lib/railradar.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '../.env') });

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const STATIONS_ONLY = args.includes('--stations');
const TRAINS_ONLY = args.includes('--trains');
const INDEXES_ONLY = args.includes('--indexes-only');

const targets = STATIONS_ONLY ? ['stations'] : TRAINS_ONLY ? ['trains'] : ['stations', 'trains'];

function line(label, value) {
  console.log(`  ${label.padEnd(18)}: ${value}`);
}

async function main() {
  if (INDEXES_ONLY) {
    const created = await connectWithIndexes();
    console.log('── Indexes ensured ───────────────────────────────────────────');
    for (const [collection, names] of Object.entries(created)) {
      line(collection, names.join(', '));
    }
    console.log('───────────────────────────────────────────────────────────────');
    await shutdownSync();
    return;
  }

  if (!railradarConfigured()) {
    console.error('RAILRADAR_API_KEY is not set in backend/.env - cannot fetch the real catalogue.');
    process.exitCode = 1;
    return;
  }

  console.log(`RailRadar base    : ${RAILRADAR_BASE_URL}`);
  console.log(`Targets           : ${targets.join(', ')}${DRY_RUN ? '  (dry run - nothing will be written)' : ''}\n`);

  const result = await syncCatalog({ targets, dryRun: DRY_RUN, trigger: 'cli' });

  console.log(`── Catalogue Sync (${result.status}) ${'─'.repeat(38)}`);
  for (const target of result.targets) {
    const r = result.results[target];
    if (!r) {
      line(target, `FAILED - ${result.errors[target]}`);
      continue;
    }
    console.log(`  ${target}`);
    line('  source', r.source);
    line('  received', r.stats.received.toLocaleString());
    line('  accepted', r.stats.accepted.toLocaleString());
    if (!DRY_RUN) {
      line('  inserted', r.inserted.toLocaleString());
      line('  updated', r.updated.toLocaleString());
    }
    line('  total after', r.after.toLocaleString());
    const rejected =
      (r.stats.invalid_code || 0) + (r.stats.invalid_number || 0) + (r.stats.empty_name || 0) + r.stats.duplicates;
    if (rejected) {
      line('  rejected', `${rejected} (malformed code / empty name / duplicate)`);
      if (r.stats.rejected_samples?.length) {
        line('  samples', r.stats.rejected_samples.join(', '));
      }
    }
  }

  if (result.status === 'partial' || result.status === 'failed') {
    console.log('\n  Warnings:');
    for (const w of result.warnings) console.log(`    - ${w}`);
  }

  console.log('\n  Collection totals:');
  const totals = await collectionCounts();
  for (const [name, count] of Object.entries(totals)) {
    line(name, count.toLocaleString());
  }
  if (totals.schedules === 0) {
    console.log('\n  Note: schedules is empty - run `python ml/scripts/sync_ntes.py --limit 200` to populate it.');
  }
  console.log('───────────────────────────────────────────────────────────────');

  if (result.status === 'failed') process.exitCode = 1;
}

main()
  .catch((err) => {
    console.error(`\nSync failed: ${err.message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await shutdownSync();
  });
