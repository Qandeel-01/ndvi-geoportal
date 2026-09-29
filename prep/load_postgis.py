"""
Step 4: apply the idempotent schema and bulk-load everything into PostGIS.

Loaded in one run:
  * sample_points   (COPY, 200k-row chunks, then GiST + btree + CLUSTER + ANALYZE)
  * aoi_boundary    (one row from data/aoi/aoi.geojson)
  * contours        (many rows from data/vectors/terrain.json)
  * app_meta        (scene, sizes, AOI, DEM stats, ridgeline) -> JSONB rows
"""
import io
import json
import logging
from pathlib import Path

import numpy as np
import psycopg
from psycopg import sql

import config

log = logging.getLogger(__name__)

COLUMNS = (
    "lon", "lat", "red", "green", "blue", "nir", "ndvi", "ndvi_class",
    "scl", "scl_label", "pixel_row", "pixel_col", "acquired", "tile",
    "elevation",
)
CHUNK_ROWS = 200_000


def classify_ndvi(ndvi: np.ndarray) -> np.ndarray:
    """Map NDVI values to the class names defined in config.NDVI_CLASSES."""
    bounds = [b for b, _ in config.NDVI_CLASSES]
    names = np.array([n for _, n in config.NDVI_CLASSES])
    return names[np.searchsorted(bounds, ndvi, side="right").clip(max=len(names) - 1)]


def scl_labels(scl: np.ndarray) -> np.ndarray:
    lookup = np.array([config.SCL_LABELS.get(i, "unknown") for i in range(256)])
    return lookup[scl.astype(np.uint8)]


def _csv_chunks(d: dict):
    """Yield the table as tab-separated text in chunks (what COPY expects)."""
    n = len(d["lon"])
    for start in range(0, n, CHUNK_ROWS):
        end = min(start + CHUNK_ROWS, n)
        buf = io.StringIO()
        for i in range(start, end):
            elev = d["elev"][i]
            # elev is usually a numpy scalar (float32), which is NOT a Python
            # float instance; check NaN directly so numpy NaNs become PG NULL
            # instead of a real "NaN" that would break aggregations later.
            try:
                is_nan = elev is None or np.isnan(elev)
            except TypeError:
                is_nan = elev is None
            elev_txt = "\\N" if is_nan else f"{float(elev):.1f}"
            buf.write(
                f"{d['lon'][i]:.7f}\t{d['lat'][i]:.7f}\t{d['red'][i]}\t{d['green'][i]}\t"
                f"{d['blue'][i]}\t{d['nir'][i]}\t{d['ndvi'][i]:.4f}\t{d['ndvi_class'][i]}\t"
                f"{d['scl'][i]}\t{d['scl_label'][i]}\t{d['row'][i]}\t{d['col'][i]}\t"
                f"{d['acquired']}\t{d['tile']}\t{elev_txt}\n"
            )
        yield buf.getvalue(), end


def _apply_schema(cur) -> None:
    """Run the idempotent schema before any DML."""
    cur.execute(Path(config.SCHEMA_SQL).read_text())
    log.info("Applied schema.sql")


def _load_points(cur, d: dict, total: int) -> tuple[int, int, int]:
    cur.execute("TRUNCATE sample_points RESTART IDENTITY")
    cur.execute("DROP INDEX IF EXISTS sample_points_geom_idx")
    cur.execute("DROP INDEX IF EXISTS sample_points_class_idx")
    cur.execute("DROP INDEX IF EXISTS sample_points_elev_idx")

    with cur.connection.transaction():
        with cur.copy(f"COPY sample_points ({', '.join(COLUMNS)}) FROM STDIN") as copy:
            for text, done in _csv_chunks(d):
                copy.write(text)
                log.info("  copied %d / %d", done, total)

    log.info("Building spatial index (GiST)...")
    cur.execute("CREATE INDEX sample_points_geom_idx ON sample_points USING GIST (geom)")
    cur.execute("CREATE INDEX sample_points_class_idx ON sample_points (ndvi_class)")
    cur.execute("CREATE INDEX sample_points_elev_idx  ON sample_points (elevation)")

    log.info("Clustering table on the spatial index...")
    cur.execute("CLUSTER sample_points USING sample_points_geom_idx")
    cur.execute("ANALYZE sample_points")

    cur.execute(
        """SELECT count(*),
                  pg_total_relation_size('sample_points'),
                  pg_relation_size('sample_points')
           FROM sample_points"""
    )
    return cur.fetchone()


def _load_aoi(cur, aoi_geojson: Path) -> dict:
    """Load the single AOI polygon into aoi_boundary (replacing any prior row)."""
    fc = json.loads(aoi_geojson.read_text())
    feat = fc["features"][0]
    props = feat["properties"]
    cur.execute("DELETE FROM aoi_boundary")
    cur.execute(
        """
        INSERT INTO aoi_boundary (name, source, area_km2, geom)
        VALUES (%s, %s, %s,
                ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON(%s), 4326)))
        """,
        (props.get("name"), props.get("source"), props.get("area_km2"),
         json.dumps(feat["geometry"])),
    )
    return props


def _load_contours(cur, contours: list[dict]) -> int:
    """Bulk-load contour lines by streaming JSON geometries."""
    cur.execute("DELETE FROM contours")
    if not contours:
        return 0
    # psycopg's executemany is fine here (few thousand rows).
    rows = [
        (c["elev"], c["major"], json.dumps(c["geom"]))
        for c in contours
    ]
    cur.executemany(
        """
        INSERT INTO contours (elev, major, geom)
        VALUES (%s, %s,
                ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON(%s), 4326)))
        """,
        rows,
    )
    return len(rows)


def _upsert_meta(cur, entries: dict) -> None:
    """Upsert JSONB values into app_meta so the API can read one row per key."""
    for key, value in entries.items():
        cur.execute(
            """
            INSERT INTO app_meta (key, value) VALUES (%s, %s::jsonb)
            ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
            """,
            (key, json.dumps(value)),
        )


def load_points() -> dict:
    """Entry point used by run_all.py."""
    raw = np.load(config.POINTS_NPZ, allow_pickle=False)
    d = {k: raw[k] for k in raw.files}
    d["acquired"] = str(d["acquired"])
    d["tile"] = str(d["tile"])
    d["ndvi_class"] = classify_ndvi(d["ndvi"])
    d["scl_label"] = scl_labels(d["scl"])
    # If the process step ran WITHOUT a DEM we still need an "elev" key.
    if "elev" not in d:
        d["elev"] = np.full(len(d["lon"]), np.nan, dtype=np.float32)
    total = len(d["lon"])
    log.info("Loading %d points into PostGIS", total)

    with psycopg.connect(config.DATABASE_URL, autocommit=True) as conn:
        with conn.cursor() as cur:
            _apply_schema(cur)
            count, total_bytes, table_bytes = _load_points(cur, d, total)

            # AOI + contours (safe if the JSON files are missing).
            aoi_props = None
            if config.AOI_GEOJSON.exists():
                aoi_props = _load_aoi(cur, config.AOI_GEOJSON)
                log.info("Loaded AOI: %s", aoi_props.get("name"))
            terrain = {}
            n_contours = 0
            if config.TERRAIN_JSON.exists():
                terrain = json.loads(config.TERRAIN_JSON.read_text())
                n_contours = _load_contours(cur, terrain.get("contours", []))
                log.info("Loaded %d contour features", n_contours)

            # Compose the app_meta document(s).
            manifest = {}
            if config.MANIFEST.exists():
                try:
                    manifest = json.loads(config.MANIFEST.read_text())
                except json.JSONDecodeError:
                    manifest = {}

            meta_entries = {
                "points": {
                    "count": int(count),
                    "table_mb": round(table_bytes / 1e6, 1),
                    "table_with_indexes_mb": round(total_bytes / 1e6, 1),
                },
                "scene": {
                    "acquired": manifest.get("scene_date"),
                    "tiles": manifest.get("tiles"),
                    "item_ids": manifest.get("item_ids", []),
                },
                "rasters": {
                    "rgb_cog_mb": manifest.get("rgb_cog_mb"),
                    "ndvi_cog_mb": manifest.get("ndvi_cog_mb"),
                    "dem_cog_mb": manifest.get("dem_cog_mb"),
                    "hillshade_cog_mb": manifest.get("hillshade_cog_mb"),
                    "rgb_compression": manifest.get("rgb_compression"),
                    "raster_size_px": manifest.get("raster_size_px"),
                },
                "aoi": aoi_props or {},
                "terrain": {
                    "elev_min_m": terrain.get("elev_min_m"),
                    "elev_max_m": terrain.get("elev_max_m"),
                    "elev_mean_m": terrain.get("elev_mean_m"),
                    "contour_count": n_contours,
                    "ridgeline": terrain.get("ridgeline", []),
                    "ridgeline_cols": terrain.get("cols"),
                    "ridgeline_rows": terrain.get("rows"),
                },
            }
            _upsert_meta(cur, meta_entries)

    result = {
        "points_in_db": int(count),
        "points_table_mb": round(table_bytes / 1e6, 1),
        "points_total_with_indexes_mb": round(total_bytes / 1e6, 1),
        "contours_in_db": n_contours,
    }
    log.info("PostGIS: %s", result)
    return result


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    load_points()
