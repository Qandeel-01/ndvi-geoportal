-- -----------------------------------------------------------------------------
-- Idempotent schema, run by the loader on EVERY pipeline execution.
-- This is separate from db/init/01_schema.sql because the init script only
-- runs on a fresh volume, and the assessment upgraded the schema after
-- first release (added elevation, aoi_boundary, contours, app_meta).
--
-- All DDL here uses IF NOT EXISTS / ADD COLUMN IF NOT EXISTS so it is safe
-- to run against an already-populated database.
-- -----------------------------------------------------------------------------

CREATE EXTENSION IF NOT EXISTS postgis;

-- --- sample_points (the vector layer) ----------------------------------------
CREATE TABLE IF NOT EXISTS sample_points (
    id          BIGSERIAL PRIMARY KEY,
    lon         DOUBLE PRECISION NOT NULL,
    lat         DOUBLE PRECISION NOT NULL,
    geom        geometry(Point, 4326)
                GENERATED ALWAYS AS (ST_SetSRID(ST_MakePoint(lon, lat), 4326)) STORED,
    red         INTEGER,
    green       INTEGER,
    blue        INTEGER,
    nir         INTEGER,
    ndvi        REAL NOT NULL,
    ndvi_class  TEXT NOT NULL,
    scl         SMALLINT,
    scl_label   TEXT,
    pixel_row   INTEGER,
    pixel_col   INTEGER,
    acquired    DATE,
    tile        TEXT
);

-- Elevation was added after v1. Existing DB volumes need this ALTER.
ALTER TABLE sample_points
    ADD COLUMN IF NOT EXISTS elevation REAL;

COMMENT ON TABLE sample_points IS
  'Stratified random sample (1 pixel per SAMPLE_STEP x SAMPLE_STEP block) of the mosaicked, AOI-clipped Sentinel-2 L2A scene. Elevation from Copernicus DEM GLO-30.';

-- --- aoi_boundary ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS aoi_boundary (
    id         SERIAL PRIMARY KEY,
    name       TEXT NOT NULL,
    source     TEXT,
    area_km2   DOUBLE PRECISION,
    geom       geometry(MultiPolygon, 4326) NOT NULL
);
CREATE INDEX IF NOT EXISTS aoi_boundary_geom_idx
    ON aoi_boundary USING GIST (geom);

-- --- contours ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS contours (
    id     SERIAL PRIMARY KEY,
    elev   INTEGER NOT NULL,
    major  BOOLEAN NOT NULL DEFAULT FALSE,
    geom   geometry(MultiLineString, 4326) NOT NULL
);
CREATE INDEX IF NOT EXISTS contours_geom_idx
    ON contours USING GIST (geom);
CREATE INDEX IF NOT EXISTS contours_elev_idx
    ON contours (elev);
CREATE INDEX IF NOT EXISTS contours_major_idx
    ON contours (major);

-- --- app_meta: everything the API's /overview endpoint needs -----------------
-- Key/value store keeps the API free of pipeline-specific columns.
CREATE TABLE IF NOT EXISTS app_meta (
    key    TEXT PRIMARY KEY,
    value  JSONB NOT NULL
);
