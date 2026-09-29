/**
 * Queries against the sample_points table in PostGIS.
 */
import { pool } from '../db.js';

/**
 * Find the sample point nearest to (lon, lat), if it lies within `radiusM`.
 *
 * - `geom <-> pt` in ORDER BY is a K-nearest-neighbour search that walks the
 *   GiST index, so it stays fast on millions of rows (no full table scan).
 * - The true distance is then computed on the spheroid (::geography) in
 *   metres, and compared with the search radius.
 * - Values are passed as $1/$2 parameters, never concatenated into the SQL
 *   string, which rules out SQL injection.
 */
export async function findNearestPoint(lon, lat, radiusM) {
  const sql = `
    WITH click AS (SELECT ST_SetSRID(ST_MakePoint($1, $2), 4326) AS pt)
    SELECT p.id, p.lon, p.lat, p.ndvi, p.ndvi_class,
           p.red, p.green, p.blue, p.nir,
           p.scl, p.scl_label, p.pixel_row, p.pixel_col,
           to_char(p.acquired, 'YYYY-MM-DD') AS acquired, p.tile,
           p.elevation,
           ST_Distance(p.geom::geography, click.pt::geography) AS distance_m
    FROM sample_points p, click
    ORDER BY p.geom <-> click.pt
    LIMIT 1`;

  const { rows } = await pool.query(sql, [lon, lat]);
  const hit = rows[0];
  if (!hit || hit.distance_m > radiusM) {
    return { found: false, searchRadiusM: Math.round(radiusM) };
  }
  return {
    found: true,
    distanceM: Math.round(hit.distance_m * 10) / 10,
    attributes: {
      id: Number(hit.id),
      lon: hit.lon,
      lat: hit.lat,
      ndvi: hit.ndvi,
      ndviClass: hit.ndvi_class,
      red: hit.red,
      green: hit.green,
      blue: hit.blue,
      nir: hit.nir,
      scl: hit.scl,
      sclLabel: hit.scl_label,
      pixelRow: hit.pixel_row,
      pixelCol: hit.pixel_col,
      acquired: hit.acquired,
      tile: hit.tile,
      elevation: hit.elevation,
    },
  };
}

/** Summary statistics for the side panel. */
export async function getPointStats() {
  const totals = await pool.query(`
    SELECT count(*)::int                                   AS total,
           round(avg(ndvi)::numeric, 3)::float             AS mean_ndvi,
           to_char(min(acquired), 'YYYY-MM-DD')            AS acquired,
           min(tile)                                       AS tile,
           pg_total_relation_size('sample_points')::bigint AS bytes,
           pg_relation_size('sample_points')::bigint       AS table_bytes
    FROM sample_points`);

  const byClass = await pool.query(`
    SELECT ndvi_class AS class, count(*)::int AS count
    FROM sample_points
    GROUP BY ndvi_class
    ORDER BY min(ndvi)`);

  const t = totals.rows[0];
  return {
    totalPoints: t.total,
    meanNdvi: t.mean_ndvi,
    acquired: t.acquired,
    tile: t.tile,
    tableSizeMb: Math.round(Number(t.table_bytes) / 1e6),
    tableWithIndexesMb: Math.round(Number(t.bytes) / 1e6),
    byClass: byClass.rows,
  };
}

/** Bounding box of all points [minLon, minLat, maxLon, maxLat], for "zoom to data". */
export async function getPointsExtent() {
  const { rows } = await pool.query(`
    SELECT ST_XMin(e) AS minx, ST_YMin(e) AS miny, ST_XMax(e) AS maxx, ST_YMax(e) AS maxy
    FROM (SELECT ST_Extent(geom) AS e FROM sample_points) s`);
  const r = rows[0];
  return r.minx === null ? null : [r.minx, r.miny, r.maxx, r.maxy];
}
