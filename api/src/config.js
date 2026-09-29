/**
 * Runtime configuration, read once from environment variables.
 * Docker Compose provides these; for local dev use `npm run dev` with an .env file.
 */

function required(name, fallback) {
  const value = process.env[name] ?? fallback;
  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const config = Object.freeze({
  port: Number(process.env.PORT ?? 4000),
  databaseUrl: required('DATABASE_URL', 'postgres://gis:change_me_pg@localhost:5433/gis'),
  geoserverUrl: required('GEOSERVER_URL', 'http://localhost:8080/geoserver'),
  workspace: required('GEOSERVER_WORKSPACE', 'ndvi_portal'),
  corsOrigin: process.env.CORS_ORIGIN ?? 'http://localhost:5173',

  // Layer names as published by prep/setup_geoserver.py
  layers: Object.freeze({
    rgb: 'rgb',
    ndvi: 'ndvi',
    dem: 'dem',
    hillshade: 'hillshade',
    points: 'sample_points',
    aoi: 'aoi_boundary',
    contours: 'contours',
  }),

  // Alternate raster styles the web app is allowed to request through the proxy.
  alternateStyles: Object.freeze({
    rgb: ['rgb_stretch', 'false_color'],
  }),

  // How long cached endpoints stay valid. The data is static after a pipeline
  // load, so 10 minutes is generous and still keeps the API cheap.
  statsCacheMs: 10 * 60 * 1000,

  // Timeout for calls from this API to GeoServer.
  geoserverTimeoutMs: 8000,
});
