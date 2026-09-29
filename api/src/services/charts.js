/**
 * Aggregations used by the dashboard's SVG charts.
 *
 * Each query is a single scan of sample_points with a small hash / percentile
 * on top, so even with several million rows the response is quick.
 *
 * Everything is computed in Postgres (not pulled row-by-row into Node) to
 * keep memory usage flat.
 */
import { pool } from '../db.js';

// NDVI histogram edges. width_bucket() puts values into 1..N buckets, so
// we shape the output to a stable [min, max, count] array of length BINS.
export const NDVI_MIN = -0.2;
export const NDVI_MAX = 1.0;
export const NDVI_BINS = 24;

/** Turn a "bucket -> count" map into the histogram array the client draws. */
export function ndviHistogramShape(bucketCounts, {
  min = NDVI_MIN, max = NDVI_MAX, bins = NDVI_BINS,
} = {}) {
  const step = (max - min) / bins;
  const out = [];
  // width_bucket(x, min, max, bins) returns 0 for x < min and bins+1 for x >= max.
  // We clamp both ends into the outermost visible bins so the histogram totals
  // stay honest even if a few pixels sit just outside the nominal range.
  for (let i = 0; i < bins; i++) {
    const lo = min + i * step;
    const hi = lo + step;
    const bucket = i + 1;
    let count = bucketCounts.get(bucket) ?? 0;
    if (i === 0) count += bucketCounts.get(0) ?? 0;
    if (i === bins - 1) count += bucketCounts.get(bins + 1) ?? 0;
    out.push({ lo: round4(lo), hi: round4(hi), count });
  }
  return out;
}

function round4(n) { return Math.round(n * 10000) / 10000; }

async function ndviHistogram() {
  const { rows } = await pool.query(
    `SELECT width_bucket(ndvi, $1, $2, $3) AS bucket, count(*)::int AS count
     FROM sample_points
     GROUP BY 1
     ORDER BY 1`,
    [NDVI_MIN, NDVI_MAX, NDVI_BINS],
  );
  const counts = new Map();
  for (const r of rows) counts.set(Number(r.bucket), Number(r.count));
  return ndviHistogramShape(counts);
}

// pg-node returns bigint and numeric columns as JavaScript strings. Every
// aggregation below already casts to ::int / ::float in SQL, but this helper
// keeps a defensive Number() coercion in one place so a future edit that
// forgets a cast still produces the numeric contract the chart components
// depend on.
function toNumericRow(row, numericKeys) {
  const out = { ...row };
  for (const k of numericKeys) {
    if (out[k] !== null && out[k] !== undefined) out[k] = Number(out[k]);
  }
  return out;
}

/**
 * NDVI vs elevation, binned every 100 m. For each band we return count,
 * mean and the p10/p90 (percentile_cont interpolates so the range is smooth).
 *
 * The `elevation != 'NaN'::real` guard is defence in depth: the loader now
 * writes NULL for any NaN it encounters, but if a NaN ever slipped in again
 * (through a schema change or a manual UPDATE), `floor(NaN * ...)::int`
 * would raise "integer out of range" and take the whole endpoint down.
 */
async function ndviByElevation() {
  const { rows } = await pool.query(`
    WITH banded AS (
      SELECT floor(elevation / 100.0) * 100 AS band, ndvi
      FROM sample_points
      WHERE elevation IS NOT NULL
        AND elevation != 'NaN'::real
    )
    SELECT band::int AS band,
           count(*)::int AS count,
           round(avg(ndvi)::numeric, 3)::float8 AS mean,
           round(percentile_cont(0.10) WITHIN GROUP (ORDER BY ndvi)::numeric, 3)::float8 AS p10,
           round(percentile_cont(0.90) WITHIN GROUP (ORDER BY ndvi)::numeric, 3)::float8 AS p90,
           round(min(ndvi)::numeric, 3)::float8 AS min,
           round(max(ndvi)::numeric, 3)::float8 AS max
    FROM banded
    GROUP BY band
    ORDER BY band`);
  return rows.map((r) => toNumericRow(r, ['band', 'count', 'mean', 'p10', 'p90', 'min', 'max']));
}

/** Share of the sample per NDVI class (water / bare_built / sparse / moderate / dense). */
async function ndviClassShare() {
  const { rows } = await pool.query(`
    SELECT ndvi_class AS class,
           count(*)::int AS count,
           round((count(*) * 100.0 / sum(count(*)) OVER())::numeric, 2)::float8 AS pct
    FROM sample_points
    GROUP BY ndvi_class
    ORDER BY min(ndvi)`);
  return rows.map((r) => toNumericRow(r, ['count', 'pct']));
}

/** Aggregate everything the /api/charts endpoint returns. */
export async function getCharts() {
  const [histogram, byElevation, classShare] = await Promise.all([
    ndviHistogram(),
    ndviByElevation(),
    ndviClassShare(),
  ]);
  return {
    ndviHistogram: {
      min: NDVI_MIN, max: NDVI_MAX, bins: NDVI_BINS,
      buckets: histogram,
    },
    ndviByElevation: byElevation,
    ndviClassShare: classShare,
  };
}
