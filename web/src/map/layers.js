/**
 * Factories for every OpenLayers layer used by the app.
 * Keeping them here means MapView only wires layers together and syncs state.
 */
import TileLayer from 'ol/layer/Tile';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import OSM from 'ol/source/OSM';
import XYZ from 'ol/source/XYZ';
import TileWMS from 'ol/source/TileWMS';
import GeoJSON from 'ol/format/GeoJSON';
import { Circle, Fill, Stroke, Style } from 'ol/style';

// ---------------------------------------------------------------------------
// Basemaps (only one visible at a time). Dark first so the default matches
// the premium dashboard theme.
//
// The switcher always shows four options: Dark, Imagery, Light, OSM. Each
// one has TWO possible sources:
//
//   * Without a Mapbox token:
//       Dark    = Carto dark_all              (free, no key)
//       Imagery = EOX Sentinel-2 Cloudless    (free, no key, CC-BY)
//       Light   = Carto light_all             (free, no key)
//       OSM     = OpenStreetMap               (free, no key)
//
//   * With VITE_MAPBOX_TOKEN set in .env:
//       Dark    = Mapbox dark-v11
//       Imagery = Mapbox satellite-streets-v12 (imagery + labels)
//       Light   = Mapbox light-v11
//       OSM     = OpenStreetMap                (never overridden)
//
// Mapbox is more reliable than the anonymous Carto and Esri endpoints
// (which can be blocked by DNS filters, Referer-gated, or rate-limited
// per region), and one token upgrades the whole switcher at once.
//
// Vite substitutes import.meta.env.VITE_* at build time, so a fresh
// `docker compose up -d --build web` is required after editing the token.
// Missing tokens are handled gracefully: the Carto / EOX defaults ship.
// ---------------------------------------------------------------------------
const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN?.trim();

// Optional style overrides. Sensible Mapbox defaults per basemap slot.
const MAPBOX_STYLE_IMAGERY =
  import.meta.env.VITE_MAPBOX_STYLE?.trim() || 'mapbox/satellite-streets-v12';
const MAPBOX_STYLE_DARK =
  import.meta.env.VITE_MAPBOX_STYLE_DARK?.trim() || 'mapbox/dark-v11';
const MAPBOX_STYLE_LIGHT =
  import.meta.env.VITE_MAPBOX_STYLE_LIGHT?.trim() || 'mapbox/light-v11';

const MAPBOX_ENABLED = !!MAPBOX_TOKEN;

export const BASEMAPS = [
  { id: 'dark', title: 'Dark' },
  { id: 'imagery', title: 'Imagery' },
  { id: 'light', title: 'Light' },
  { id: 'osm', title: 'OSM' },
];

/** Build a Mapbox tile source for a given style. Retina tiles (@2x) look
 *  crisper on HiDPI displays for the same request count. */
function mapboxSource(style) {
  return new XYZ({
    url:
      `https://api.mapbox.com/styles/v1/${style}/tiles/`
      + '{z}/{x}/{y}@2x'
      + `?access_token=${MAPBOX_TOKEN}`,
    attributions: '© Mapbox © OpenStreetMap',
    tileSize: 512,
    maxZoom: 22,
    crossOrigin: 'anonymous',
  });
}

// Anonymous fallbacks used when no Mapbox token is present.
const CARTO_DARK = new XYZ({
  url: 'https://{a-d}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
  attributions: '© OpenStreetMap contributors © CARTO',
  maxZoom: 20,
});
const CARTO_LIGHT = new XYZ({
  url: 'https://{a-d}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png',
  attributions: '© OpenStreetMap contributors © CARTO',
  maxZoom: 20,
});
const EOX_S2 = new XYZ({
  // EOX Sentinel-2 Cloudless 2020 (global, no key, CC-BY 4.0). CORS is open.
  url: 'https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2020_3857/default/g/{z}/{y}/{x}.jpg',
  attributions:
    'Sentinel-2 cloudless - https://s2maps.eu by EOX IT Services GmbH (CC BY 4.0)',
  maxZoom: 17,
  cacheSize: 512,
});

export function createBasemapLayers() {
  return {
    dark: new TileLayer({
      visible: true,
      source: MAPBOX_ENABLED ? mapboxSource(MAPBOX_STYLE_DARK) : CARTO_DARK,
    }),
    imagery: new TileLayer({
      visible: false,
      source: MAPBOX_ENABLED ? mapboxSource(MAPBOX_STYLE_IMAGERY) : EOX_S2,
    }),
    light: new TileLayer({
      visible: false,
      source: MAPBOX_ENABLED ? mapboxSource(MAPBOX_STYLE_LIGHT) : CARTO_LIGHT,
    }),
    osm: new TileLayer({ source: new OSM(), visible: false }),
  };
}

// ---------------------------------------------------------------------------
// Data layers served by GeoServer, through the Node proxy (/geoserver/...)
// ---------------------------------------------------------------------------
/**
 * A tiled WMS layer. Requesting 256 px tiles (instead of one big image) lets
 * the browser cache and load tiles in parallel, and lets GeoServer's tile cache
 * (GeoWebCache) serve repeat requests. The STYLES param is passed so the
 * client can flip an alternate style (e.g. false-colour RGB).
 */
function createWmsLayer(wmsUrl, layerName, { visible, opacity, zIndex, styles = '' }) {
  return new TileLayer({
    visible,
    opacity,
    zIndex,
    source: new TileWMS({
      url: wmsUrl,
      params: {
        LAYERS: layerName,
        STYLES: styles,
        TILED: true,
        FORMAT: 'image/png',
        TRANSPARENT: true,
      },
      serverType: 'geoserver',
      transition: 0,
    }),
  });
}

export function createDataLayers(meta, initialState) {
  const byId = Object.fromEntries(meta.layers.map((l) => [l.id, l]));
  const layers = {};
  // z-index order: raster fills at the bottom, points and vectors on top.
  if (byId.hillshade) layers.hillshade = createWmsLayer(meta.wmsUrl, byId.hillshade.name, { ...initialState.hillshade, zIndex: 5 });
  if (byId.dem)       layers.dem       = createWmsLayer(meta.wmsUrl, byId.dem.name,       { ...initialState.dem,       zIndex: 7 });
  if (byId.rgb)       layers.rgb       = createWmsLayer(meta.wmsUrl, byId.rgb.name,       { ...initialState.rgb,       zIndex: 10 });
  if (byId.ndvi)      layers.ndvi      = createWmsLayer(meta.wmsUrl, byId.ndvi.name,      { ...initialState.ndvi,      zIndex: 12 });
  if (byId.contours)  layers.contours  = createWmsLayer(meta.wmsUrl, byId.contours.name,  { ...initialState.contours,  zIndex: 18 });
  if (byId.points)    layers.points    = createWmsLayer(meta.wmsUrl, byId.points.name,    { ...initialState.points,    zIndex: 22 });
  return layers;
}

/** Update a WMS layer's STYLES param (used for RGB true/false colour toggle). */
export function setLayerStyle(layer, style) {
  layer.getSource().updateParams({ STYLES: style ?? '' });
}

// ---------------------------------------------------------------------------
// AOI vector layer (drawn client-side from /api/aoi). Glowing pale-blue
// stroke, no fill. A separate style handles the "dashed" marching outline.
// ---------------------------------------------------------------------------
export function createAoiLayer() {
  return new VectorLayer({
    source: new VectorSource(),
    zIndex: 30,
    style: () => new Style({
      stroke: new Stroke({
        color: '#a8d4e0',
        width: 1.8,
        lineDash: [8, 6],
        lineDashOffset: 0,
      }),
    }),
  });
}

export function loadAoiFeatures(vectorLayer, geojson) {
  const src = vectorLayer.getSource();
  src.clear();
  if (!geojson) return;
  const features = new GeoJSON().readFeatures(geojson, {
    dataProjection: 'EPSG:4326',
    featureProjection: 'EPSG:3857',
  });
  src.addFeatures(features);
}

// ---------------------------------------------------------------------------
// Highlight layer: shows the clicked location and the matched sample point
// ---------------------------------------------------------------------------
export function createHighlightLayer() {
  return new VectorLayer({
    source: new VectorSource(),
    zIndex: 100,
    style: (feature) =>
      feature.get('kind') === 'click'
        ? new Style({
            image: new Circle({
              radius: 5,
              fill: new Fill({ color: '#a8d4e0' }),
              stroke: new Stroke({ color: '#0a0a0b', width: 2 }),
            }),
          })
        : new Style({
            image: new Circle({
              radius: 10,
              fill: new Fill({ color: 'rgba(0,0,0,0)' }),
              stroke: new Stroke({ color: '#d6f58a', width: 2.5 }),
            }),
          }),
  });
}
