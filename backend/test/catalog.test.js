// Pure-logic tests for the catalogue layer: no database required.
// Run: node --test backend/test/catalog.test.js   (from repo root)
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizeStationCode,
  normalizeStationName,
  normalizeTrainNumber,
  parsePagination,
  buildSearchFilter,
  MAX_LIMIT,
} from '../src/lib/catalogStore.js';
import { databaseNameFromUri, defaultIndexName, INDEX_SPECS, COLLECTIONS } from '../src/lib/db.js';

// ---------------------------------------------------------------------------
// Station code normalization
// ---------------------------------------------------------------------------

test('normalizeStationCode uppercases and strips whitespace', () => {
  assert.equal(normalizeStationCode('ndls'), 'NDLS');
  assert.equal(normalizeStationCode('  ndls  '), 'NDLS');
  assert.equal(normalizeStationCode('N D L S'), 'NDLS');
  assert.equal(normalizeStationCode('bvi'), 'BVI');
});

test('normalizeStationCode accepts real-world shapes', () => {
  // 2 to 5 chars, letter first, then letters/digits.
  for (const code of ['AA', 'ST', 'BVI', 'NDLS', 'MMCT', 'AAGH', 'HWH', 'ERS', 'JBP', 'BJU']) {
    assert.equal(normalizeStationCode(code), code, `${code} should be valid`);
  }
});

test('normalizeStationCode rejects malformed input', () => {
  for (const bad of ['', '   ', '1', '12345', 'TOOLONGCODE', '-NDLS', 'NDLS!', 'N/L', null, undefined, {}]) {
    assert.equal(normalizeStationCode(bad), null, `${JSON.stringify(bad)} should be rejected`);
  }
});

test('normalizeStationCode collapses internal whitespace before validating', () => {
  // "N D L S" -> "NDLS" (4 chars) is valid.
  assert.equal(normalizeStationCode('N D L S'), 'NDLS');
  // 5 chars is still within the 2-5 limit: "N D L S X" -> "NDLSX".
  assert.equal(normalizeStationCode('N D L S X'), 'NDLSX');
  // 6 chars exceeds the limit and is rejected.
  assert.equal(normalizeStationCode('N D L S X Y'), null);
});

// ---------------------------------------------------------------------------
// Station name / train number normalization
// ---------------------------------------------------------------------------

test('normalizeStationName trims and collapses whitespace', () => {
  assert.equal(normalizeStationName('  New   Delhi  '), 'New Delhi');
  assert.equal(normalizeStationName('Mumbai Central'), 'Mumbai Central');
  assert.equal(normalizeStationName(null), '');
  assert.equal(normalizeStationName(undefined), '');
});

test('normalizeTrainNumber keeps bare digits only', () => {
  assert.equal(normalizeTrainNumber('12951'), '12951');
  assert.equal(normalizeTrainNumber(' 12951 '), '12951');
  assert.equal(normalizeTrainNumber('12951A'), '12951');
  assert.equal(normalizeTrainNumber(12951), '12951');
});

test('normalizeTrainNumber rejects out-of-range lengths', () => {
  for (const bad of ['', '123', '1234567', 'abcd', null, undefined]) {
    assert.equal(normalizeTrainNumber(bad), null, `${JSON.stringify(bad)} should be rejected`);
  }
});

// ---------------------------------------------------------------------------
// Pagination
// ---------------------------------------------------------------------------

test('parsePagination defaults to page 1', () => {
  const parsed = parsePagination({});
  assert.equal(parsed.page, 1);
  assert.equal(parsed.limit, 20);
  assert.equal(parsed.noLimit, false);
});

test('parsePagination clamps limit to MAX_LIMIT', () => {
  assert.equal(parsePagination({ limit: '1000' }).limit, MAX_LIMIT);
  assert.equal(parsePagination({ limit: '5' }).limit, 5);
});

test('parsePagination treats limit=0 as unlimited (back-compat)', () => {
  const parsed = parsePagination({ limit: '0' });
  assert.equal(parsed.limit, 0);
  assert.equal(parsed.noLimit, true);
});

test('parsePagination rejects invalid values', () => {
  assert.ok(parsePagination({ page: '0' }).error);
  assert.ok(parsePagination({ page: '-1' }).error);
  assert.ok(parsePagination({ page: 'abc' }).error);
  assert.ok(parsePagination({ limit: '-5' }).error);
  assert.ok(parsePagination({ limit: 'abc' }).error);
});

test('parsePagination floors fractional values', () => {
  assert.equal(parsePagination({ page: '2.7' }).page, 2);
  assert.equal(parsePagination({ limit: '10.9' }).limit, 10);
});

// ---------------------------------------------------------------------------
// Search filters
// ---------------------------------------------------------------------------

const STATION_FIELDS = {
  codeFields: ['code'],
  textFields: ['name', 'city', 'state'],
};

test('buildSearchFilter returns {} for an empty term', () => {
  assert.deepEqual(buildSearchFilter('', STATION_FIELDS), {});
  assert.deepEqual(buildSearchFilter('   ', STATION_FIELDS), {});
  assert.deepEqual(buildSearchFilter(undefined, STATION_FIELDS), {});
});

test('buildSearchFilter anchors code but not name (Delhi finds New Delhi)', () => {
  const filter = buildSearchFilter('Delhi', STATION_FIELDS);
  assert.equal(filter.$or.length, 4);
  // code branch is anchored
  assert.equal(filter.$or[0].code.source, '^Delhi');
  assert.equal(filter.$or[0].code.flags, 'i');
  // name/city/state branches are unanchored contains
  assert.equal(filter.$or[1].name.source, 'Delhi');
});

test('buildSearchFilter uses the text index in text mode', () => {
  const filter = buildSearchFilter('rajdhani', STATION_FIELDS, 'text');
  assert.deepEqual(filter, { $text: { $search: 'rajdhani' } });
});

test('buildSearchFilter rejects an unknown search_mode', () => {
  const filter = buildSearchFilter('x', STATION_FIELDS, 'fuzzy');
  assert.ok(filter.__error);
});

test('buildSearchFilter escapes regex metacharacters', () => {
  const filter = buildSearchFilter('a.b*c', STATION_FIELDS);
  // A literal dot/star must not act as a wildcard.
  assert.equal(filter.$or[0].code.source, '^a\\.b\\*c');
});

// ---------------------------------------------------------------------------
// URI parsing
// ---------------------------------------------------------------------------

test('databaseNameFromUri reads the database from the URI path', () => {
  assert.equal(databaseNameFromUri('mongodb://127.0.0.1:27017/railbuddy'), 'railbuddy');
  assert.equal(
    databaseNameFromUri('mongodb+srv://u:p@cluster.mongodb.net/railbuddy?retryWrites=true&w=majority'),
    'railbuddy',
  );
  assert.equal(databaseNameFromUri('mongodb+srv://u:p@cluster.mongodb.net/prod_db'), 'prod_db');
  assert.equal(databaseNameFromUri('mongodb://127.0.0.1:27017/railbuddy/'), 'railbuddy');
});

test('databaseNameFromUri falls back when no database is given', () => {
  assert.equal(databaseNameFromUri('mongodb://127.0.0.1:27017'), 'railbuddy');
  assert.equal(databaseNameFromUri('mongodb+srv://u:p@cluster.mongodb.net'), 'railbuddy');
  assert.equal(databaseNameFromUri(''), 'railbuddy');
});

test('databaseNameFromUri is not confused by credentials or query strings', () => {
  // The password contains a slash and an @; neither may be mistaken for the path.
  assert.equal(
    databaseNameFromUri('mongodb+srv://user:p%40ss%2Fword@cluster.mongodb.net/railbuddy?w=majority'),
    'railbuddy',
  );
});

// ---------------------------------------------------------------------------
// Index specifications
// ---------------------------------------------------------------------------

test('every collection in COLLECTIONS has an index spec', () => {
  for (const name of Object.values(COLLECTIONS)) {
    assert.ok(INDEX_SPECS[name], `missing index spec for ${name}`);
  }
});

test('identity fields are uniquely indexed', () => {
  const uniqueFor = (collection, field) =>
    INDEX_SPECS[collection].some((i) => i.options?.unique && i.key[field] === 1);

  assert.ok(uniqueFor(COLLECTIONS.stations, 'code'));
  assert.ok(uniqueFor(COLLECTIONS.trains, 'number'));
  assert.ok(uniqueFor(COLLECTIONS.schedules, 'train_number'));
});

test('at most one text index per collection (MongoDB restriction)', () => {
  for (const [collection, specs] of Object.entries(INDEX_SPECS)) {
    const textIndexes = specs.filter((i) => Object.values(i.key).includes('text'));
    assert.ok(textIndexes.length <= 1, `${collection} declares ${textIndexes.length} text indexes`);
  }
});

test('index names are the canonical driver name for their key pattern', () => {
  // MongoDB keys an index by its key pattern, so asking for a key under a name
  // that differs from the stored one is rejected on every startup with
  // "Index already exists with a different name". Text indexes are the one
  // exception: they are always created under the explicit name below.
  for (const [collection, specs] of Object.entries(INDEX_SPECS)) {
    for (const spec of specs) {
      if (Object.values(spec.key).includes('text')) {
        assert.equal(spec.name, 'text_idx', `${collection} text index should be named text_idx`);
        continue;
      }
      assert.equal(
        spec.name,
        defaultIndexName(spec.key),
        `${collection}.${spec.name} should be named ${defaultIndexName(spec.key)}`,
      );
    }
  }
});

test('every collection declares no duplicate index names', () => {
  for (const [collection, specs] of Object.entries(INDEX_SPECS)) {
    const names = specs.map((s) => s.name);
    assert.equal(new Set(names).size, names.length, `${collection} declares a duplicate index name`);
  }
});

test('a single-field key is never declared both unique and non-unique', () => {
  for (const [collection, specs] of Object.entries(INDEX_SPECS)) {
    const bySignature = new Map();
    for (const spec of specs) {
      if (Object.values(spec.key).includes('text')) continue;
      const signature = defaultIndexName(spec.key);
      if (bySignature.has(signature)) {
        assert.equal(
          Boolean(spec.options?.unique),
          Boolean(bySignature.get(signature).options?.unique),
          `${collection}.${signature} is declared with conflicting unique flags`,
        );
      }
      bySignature.set(signature, spec);
    }
  }
});
