// Sync record-building tests. Pure functions, no database and no network.
//
// The fixtures reproduce the shape and quirks of the REAL RailRadar responses
// captured on 2026-09-26 (13,005 station entries including empty and
// over-long keys; a `{ trainNumber: name }` train map).
import test from 'node:test';
import assert from 'node:assert/strict';

import { buildStationRecords, buildTrainRecords } from '../src/lib/sync.js';

// Entries are [key, value] pairs, i.e. exactly what Object.entries() yields from
// the live JSON payload. Arrays are used (not object literals) because a JS
// object literal silently collapses duplicate keys, which would make the
// dedup path untestable.
const STATION_DIRECTORY = [
  ['AA', 'Ataria'],
  ['AABH', 'Ambika Bhawani Halt'],
  ['AAG', 'Angar'],
  ['BVI', 'BORIVALI'],
  ['MMCT', 'MUMBAI CENTRAL'],
  ['NDLS', 'NEW DELHI'],
  ['ST', 'SURAT'],
  // Realistic noise observed in the live payload:
  ['', 'Ghost Entry'],
  ['1', 'Single Digit Code'],
  ['TOOLONGCODE', 'Over Long Code'],
  // Lower-case key that normalizes onto an existing code:
  ['ndls', 'DUPLICATE NEW DELHI'],
];

const TRAIN_DIRECTORY = [
  ['10103', 'MANDOVI EXPRESS'],
  ['12951', 'NDLS TEJAS RAJ'],
  ['22436', 'VANDE BHARAT EXPRESS'],
  ['99999', 'FIVE DIGIT TRAIN'],
  ['123', 'Too Short'],
  ['1234567', 'Too Long'],
  // Suffix that normalizes onto an existing number:
  ['12951a', 'DUPLICATE TEJAS'],
];

test('buildStationRecords keeps well-formed entries', () => {
  const { records, stats } = buildStationRecords(STATION_DIRECTORY);
  const codes = records.map((r) => r.code);

  assert.ok(codes.includes('AA'));
  assert.ok(codes.includes('NDLS'));
  assert.ok(codes.includes('BVI'));
  assert.equal(records.find((r) => r.code === 'NDLS').name, 'NEW DELHI');
  assert.equal(stats.received, 11);
  assert.equal(stats.accepted, 7);
});

test('buildStationRecords rejects malformed codes instead of inventing them', () => {
  const { records, stats } = buildStationRecords(STATION_DIRECTORY);
  const codes = records.map((r) => r.code);

  // '', '1' and 'TOOLONGCODE' all fail the code pattern.
  assert.equal(stats.invalid_code, 3);
  assert.ok(!codes.includes(''));
  assert.ok(!codes.includes('1'));
  assert.ok(!codes.includes('TOOLONGCODE'));
});

test('buildStationRecords collapses a duplicate code to the first occurrence', () => {
  const { records, stats } = buildStationRecords(STATION_DIRECTORY);
  assert.equal(stats.duplicates, 1);
  assert.equal(records.filter((r) => r.code === 'NDLS').length, 1);
  // The first entry wins, so the name is not overwritten by the later duplicate.
  assert.equal(records.find((r) => r.code === 'NDLS').name, 'NEW DELHI');
});

test('buildStationRecords never fabricates fields the provider omits', () => {
  const { records } = buildStationRecords([['NDLS', 'NEW DELHI']]);
  const [record] = records;

  assert.equal(record.code, 'NDLS');
  assert.equal(record.name, 'NEW DELHI');
  // RailRadar's directory carries only code + name; these must stay null.
  for (const field of ['city', 'state', 'zone', 'division', 'latitude', 'longitude', 'aliases']) {
    assert.equal(record[field], null, `${field} must not be invented`);
  }
  assert.equal(record.is_core, false);
  assert.equal(record.source, 'railradar:/lookup/stations');
});

test('buildStationRecords drops entries with an empty name', () => {
  const { records, stats } = buildStationRecords([
    ['NDLS', 'NEW DELHI'],
    ['ZZZZ', '   '],
  ]);
  assert.equal(stats.empty_name, 1);
  assert.equal(records.length, 1);
});

test('buildStationRecords trims and collapses names', () => {
  const { records } = buildStationRecords([['NDLS', '  NEW    DELHI  ']]);
  assert.equal(records[0].name, 'NEW DELHI');
});

test('buildStationRecords samples rejections for the operator', () => {
  const { stats } = buildStationRecords(STATION_DIRECTORY);
  assert.ok(Array.isArray(stats.rejected_samples));
  assert.ok(stats.rejected_samples.length > 0);
  assert.ok(stats.rejected_samples.length <= 10, 'samples must stay bounded');
});

test('buildStationRecords handles an empty directory', () => {
  const { records, stats } = buildStationRecords([]);
  assert.deepEqual(records, []);
  assert.equal(stats.received, 0);
  assert.equal(stats.accepted, 0);
});

test('buildTrainRecords keeps well-formed numbers', () => {
  const { records } = buildTrainRecords(TRAIN_DIRECTORY);
  const numbers = records.map((r) => r.number);

  assert.ok(numbers.includes('12951'));
  assert.ok(numbers.includes('22436'));
  assert.ok(numbers.includes('99999'));
  assert.equal(records.find((r) => r.number === '12951').name, 'NDLS TEJAS RAJ');
});

test('buildTrainRecords rejects out-of-range numbers', () => {
  const { records, stats } = buildTrainRecords(TRAIN_DIRECTORY);
  const numbers = records.map((r) => r.number);

  assert.equal(stats.invalid_number, 2, '"123" (3 digits) and "1234567" (7 digits) must be rejected');
  assert.ok(!numbers.includes('123'));
  assert.ok(!numbers.includes('1234567'));
});

test('buildTrainRecords never fabricates route or schedule fields', () => {
  const { records } = buildTrainRecords([['12951', 'NDLS TEJAS RAJ']]);
  const [record] = records;

  assert.equal(record.number, '12951');
  assert.equal(record.name, 'NDLS TEJAS RAJ');
  for (const field of [
    'name_hindi',
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
  ]) {
    assert.equal(record[field], null, `${field} must not be invented`);
  }
  assert.equal(record.source, 'railradar:/lookup/trains');
});

test('buildTrainRecords strips non-numeric suffixes', () => {
  const { records } = buildTrainRecords([['12951A', 'NDLS TEJAS RAJ']]);
  assert.equal(records[0].number, '12951');
});

test('buildTrainRecords normalizes every record to a unique number', () => {
  const { records } = buildTrainRecords(TRAIN_DIRECTORY);
  const numbers = records.map((r) => r.number);
  assert.equal(new Set(numbers).size, numbers.length, 'train numbers must be unique');
});
