/**
 * Aggregate everything the dashboard header + charts need in one shot.
 *
 * Reads from PostGIS:
 *   - app_meta (JSONB) written by prep/load_postgis.py: scene info, sizes,
 *     AOI, DEM stats, ridgeline (already downsampled)
 *   - sample_points count / mean NDVI
 *   - aoi_boundary (as GeoJSON, simplified)
 */
import { pool } from '../db.js';

/** Fetch all app_meta rows into a plain object. */
async function readAppMeta() {
  const { rows } = await pool.query('SELECT key, value FROM app_meta');
  const out = {};
  for (const r of rows) out[r.key] = r.value;
  return out;
}

/** One JSON payload for the dashboard's header + hero + counters. */
export async function getOverview() {
  const meta = await readAppMeta();
  const totals = await pool.query(`
    SELECT count(*)::int                            AS total,
           round(avg(ndvi)::numeric, 3)::float      AS mean_ndvi,
           to_char(min(acquired), 'YYYY-MM-DD')     AS acquired,
           min(tile)                                AS tile
    FROM sample_points`);
  const t = totals.rows[0] ?? {};
  const aoi = meta.aoi ?? {};
  const scene = meta.scene ?? {};
  const rasters = meta.rasters ?? {};
  const points = meta.points ?? {};
  const terrain = meta.terrain ?? {};

  return {
    aoi: {
      name: aoi.name ?? null,
      source: aoi.source ?? null,
      areaKm2: aoi.area_km2 ?? null,
    },
    scene: {
      acquired: scene.acquired ?? t.acquired ?? null,
      tiles: scene.tiles ?? t.tile ?? null,
      itemIds: scene.item_ids ?? [],
    },
    points: {
      total: t.total ?? 0,
      meanNdvi: t.mean_ndvi ?? null,
      tableMb: points.table_mb ?? null,
      tableWithIndexesMb: points.table_with_indexes_mb ?? null,
    },
    rasters: {
      rgbCogMb: rasters.rgb_cog_mb ?? null,
      ndviCogMb: rasters.ndvi_cog_mb ?? null,
      demCogMb: rasters.dem_cog_mb ?? null,
      hillshadeCogMb: rasters.hillshade_cog_mb ?? null,
      rgbCompression: rasters.rgb_compression ?? null,
      sizePx: rasters.raster_size_px ?? null,
    },
    terrain: {
      elevMin: terrain.elev_min_m ?? null,
      elevMax: terrain.elev_max_m ?? null,
      elevMean: terrain.elev_mean_m ?? null,
      contourCount: terrain.contour_count ?? 0,
      ridgeline: terrain.ridgeline ?? [],
      ridgelineCols: terrain.ridgeline_cols ?? 0,
      ridgelineRows: terrain.ridgeline_rows ?? 0,
    },
  };
}

/**
 * Simplified AOI polygon as a GeoJSON Feature. Simplification keeps the
 * payload small enough to send with every page load (< 20 KB typical).
 * ST_SimplifyPreserveTopology retains a valid polygon shape.
 */
export async function getAoiGeoJson() {
  const { rows } = await pool.query(`
    SELECT name, source, area_km2,
           ST_AsGeoJSON(
             ST_SimplifyPreserveTopology(geom, 0.0005)
           )::json AS geometry
    FROM aoi_boundary
    LIMIT 1`);
  const r = rows[0];
  if (!r) return null;
  return {
    type: 'Feature',
    properties: {
      name: r.name,
      source: r.source,
      area_km2: r.area_km2,
    },
    geometry: r.geometry,
  };
}
