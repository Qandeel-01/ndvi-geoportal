/**
 * Talking to GeoServer from the API.
 *
 * Pixel values are read with a WMS GetFeatureInfo request: we ask GeoServer
 * for a tiny 101 x 101 px "map" centred on the clicked location and then
 * query the centre pixel (X=50, Y=50). GeoServer returns the raw band values
 * of the raster at that spot as GeoJSON.
 */
import { config } from '../config.js';

const NODATA_THRESHOLD_NDVI = -9998;      // NDVI nodata is -9999
const NODATA_THRESHOLD_DEM = -32000;      // DEM nodata is -32767

/**
 * Build a GetFeatureInfo URL for one layer at (lon, lat).
 * WMS 1.1.1 is used on purpose: with EPSG:4326 it keeps lon/lat axis order,
 * avoiding the classic WMS 1.3.0 "lat/lon flipped" bug.
 */
export function buildGetFeatureInfoUrl(layer, lon, lat, { base = config.geoserverUrl, workspace = config.workspace } = {}) {
  const half = 0.0005; // ~50 m box around the click; only the centre pixel is queried
  const params = new URLSearchParams({
    SERVICE: 'WMS',
    VERSION: '1.1.1',
    REQUEST: 'GetFeatureInfo',
    LAYERS: `${workspace}:${layer}`,
    QUERY_LAYERS: `${workspace}:${layer}`,
    STYLES: '',
    SRS: 'EPSG:4326',
    BBOX: [lon - half, lat - half, lon + half, lat + half].join(','),
    WIDTH: '101',
    HEIGHT: '101',
    X: '50',
    Y: '50',
    INFO_FORMAT: 'application/json',
    FEATURE_COUNT: '1',
  });
  return `${base}/${workspace}/wms?${params.toString()}`;
}

/**
 * Extract band values from a GetFeatureInfo JSON response.
 * GeoServer names raster bands differently depending on the file
 * (GRAY_INDEX, RED_BAND, Band1 ...), so values are read in band order
 * rather than by name.
 */
export function extractBandValues(json) {
  const props = json?.features?.[0]?.properties;
  if (!props) return null; // clicked outside the raster
  return Object.values(props).map((v) => (v === null ? NaN : Number(v)));
}

async function getFeatureInfo(layer, lon, lat) {
  const url = buildGetFeatureInfoUrl(layer, lon, lat);
  const res = await fetch(url, { signal: AbortSignal.timeout(config.geoserverTimeoutMs) });
  if (!res.ok) {
    throw new Error(`GeoServer GetFeatureInfo failed for ${layer}: HTTP ${res.status}`);
  }
  return extractBandValues(await res.json());
}

/** NDVI value at a location (null value when outside the scene or masked). */
export async function getNdviAt(lon, lat) {
  const bands = await getFeatureInfo(config.layers.ndvi, lon, lat);
  const value = bands?.[0];
  if (value === undefined || Number.isNaN(value) || value <= NODATA_THRESHOLD_NDVI) {
    return { noData: true, value: null, reason: 'Outside the scene or masked (cloud / shadow)' };
  }
  return { noData: false, value: Math.round(value * 10000) / 10000 };
}

/**
 * RGB reflectance at a location. The 4-band raster is R, G, B, NIR.
 * We return all four so the client can display a true and near-IR reading.
 */
export async function getRgbAt(lon, lat) {
  const bands = await getFeatureInfo(config.layers.rgb, lon, lat);
  if (!bands || bands.length < 3 || bands.slice(0, 3).every((v) => v === 0 || Number.isNaN(v))) {
    return { noData: true, reason: 'Outside the scene' };
  }
  const [red, green, blue, nir] = bands;
  return {
    noData: false,
    red,
    green,
    blue,
    nir: Number.isFinite(nir) ? nir : null,
    reflectance: {
      red: red / 10000,
      green: green / 10000,
      blue: blue / 10000,
      nir: Number.isFinite(nir) ? nir / 10000 : null,
    },
  };
}

/** Elevation in metres at a location (null when outside DEM or nodata). */
export async function getDemAt(lon, lat) {
  const bands = await getFeatureInfo(config.layers.dem, lon, lat);
  const value = bands?.[0];
  if (value === undefined || Number.isNaN(value) || value <= NODATA_THRESHOLD_DEM) {
    return { noData: true, value: null, reason: 'Outside the DEM' };
  }
  return { noData: false, value: Math.round(value * 10) / 10 };
}
