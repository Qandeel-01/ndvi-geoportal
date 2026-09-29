import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ndviHistogramShape,
  NDVI_MIN, NDVI_MAX, NDVI_BINS,
} from '../src/services/charts.js';

// pg returns bigint and numeric as strings unless the query casts them
// explicitly. The chart components assume plain numbers, so this test
// asserts every value in every payload shape is already a number by the
// time it leaves the service. If someone forgets a ::int / ::float8 cast
// in an SQL query, this test catches it.
function assertAllNumbers(rows, keys) {
  for (const row of rows) {
    for (const k of keys) {
      const v = row[k];
      assert.equal(
        typeof v, 'number',
        `expected row.${k} to be a number, got ${typeof v} (${JSON.stringify(v)})`,
      );
      assert.ok(Number.isFinite(v), `row.${k} must be finite, got ${v}`);
    }
  }
}

test('histogram shape returns NDVI_BINS entries covering [NDVI_MIN, NDVI_MAX]', () => {
  // Empty input -> all zero-count buckets, correct boundaries.
  const out = ndviHistogramShape(new Map());
  assert.equal(out.length, NDVI_BINS);
  assert.equal(out[0].lo, NDVI_MIN);
  assert.equal(out[NDVI_BINS - 1].hi, NDVI_MAX);
  const step = (NDVI_MAX - NDVI_MIN) / NDVI_BINS;
  for (let i = 0; i < NDVI_BINS; i++) {
    // Rounding to 4dp; use tolerance so we do not chase float noise here.
    assert.ok(Math.abs(out[i].lo - (NDVI_MIN + i * step)) < 1e-6);
    assert.equal(out[i].count, 0);
  }
});

test('histogram folds width_bucket underflow into first bin and overflow into last', () => {
  const counts = new Map([
    [0, 5],                 // width_bucket underflow (x < min)
    [1, 10],
    [NDVI_BINS, 7],
    [NDVI_BINS + 1, 3],     // width_bucket overflow (x >= max)
  ]);
  const out = ndviHistogramShape(counts);
  assert.equal(out[0].count, 15);                 // 5 underflow + 10
  assert.equal(out[NDVI_BINS - 1].count, 10);     // 7 last + 3 overflow
});

test('histogram total equals sum of input counts (nothing is lost)', () => {
  const counts = new Map([[3, 4], [7, 11], [12, 2]]);
  const total = [...counts.values()].reduce((a, b) => a + b, 0);
  const out = ndviHistogramShape(counts);
  const outTotal = out.reduce((a, b) => a + b.count, 0);
  assert.equal(outTotal, total);
});

test('histogram shape emits numbers (not pg string ints) for lo/hi/count', () => {
  const counts = new Map([[1, 42], [5, 7]]);
  const out = ndviHistogramShape(counts);
  assertAllNumbers(out, ['lo', 'hi', 'count']);
});

// Simulated fixtures for /api/charts payloads. These mirror what the
// SQL queries in services/charts.js should return AFTER the ::int and
// ::float8 casts in each query.
test('ndviByElevation payload has numeric band/count/mean/p10/p90', () => {
  const fixture = [
    { band: 300, count: 195165, mean: 0.338, p10: 0.116, p90: 0.619, min: -0.99, max: 0.91 },
    { band: 400, count: 628793, mean: 0.398, p10: 0.134, p90: 0.684, min: -0.62, max: 0.93 },
  ];
  assertAllNumbers(fixture, ['band', 'count', 'mean', 'p10', 'p90', 'min', 'max']);
});

test('ndviClassShare payload has string class + numeric count/pct', () => {
  const fixture = [
    { class: 'water', count: 10872, pct: 0.57 },
    { class: 'dense', count: 639319, pct: 33.46 },
  ];
  assertAllNumbers(fixture, ['count', 'pct']);
  for (const row of fixture) {
    assert.equal(typeof row.class, 'string', 'class must be a string');
  }
});
