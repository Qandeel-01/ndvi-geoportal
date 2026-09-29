-- -----------------------------------------------------------------------------
-- Runs once when the PostGIS container is first created.
-- Kept in sync with prep/schema.sql (which the loader re-applies on every run,
-- so an existing volume is upgraded in place). See prep/schema.sql for
-- comments; both files must match to avoid drift between fresh and existing
-- installs.
-- -----------------------------------------------------------------------------

CREATE EXTENSION IF NOT EXISTS postgis;

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
    tile        TEXT,
    elevation   REAL
);

COMMENT ON TABLE sample_points IS
  'Stratified random sample of the mosaicked, AOI-clipped Sentinel-2 L2A scene with NDVI + reflectance + elevation attributes.';

CREATE TABLE IF NOT EXISTS aoi_boundary (
    id         SERIAL PRIMARY KEY,
    name       TEXT NOT NULL,
    source     TEXT,
    area_km2   DOUBLE PRECISION,
    geom       geometry(MultiPolygon, 4326) NOT NULL
);
CREATE INDEX IF NOT EXISTS aoi_boundary_geom_idx
    ON aoi_boundary USING GIST (geom);

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

CREATE TABLE IF NOT EXISTS app_meta (
    key    TEXT PRIMARY KEY,
    value  JSONB NOT NULL
);
