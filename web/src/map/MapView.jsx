/**
 * The OpenLayers map.
 *
 * OpenLayers manages its own DOM and canvas, so React does NOT re-render the
 * map. Instead:
 *   1. the map is created once (first effect) and kept in a ref
 *   2. small effects push React state into it (visibility, opacity, basemap,
 *      style, highlight, AOI)
 *   3. map events (clicks, tile loading) are reported back through callbacks
 *   4. an imperative handle lets the parent trigger "fit AOI" / "reset view"
 */
import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import Map from 'ol/Map';
import View from 'ol/View';
import Feature from 'ol/Feature';
import Point from 'ol/geom/Point';
import { defaults as defaultControls, ScaleLine, MousePosition } from 'ol/control';
import { fromLonLat, toLonLat, transformExtent } from 'ol/proj';
import { format as formatCoord } from 'ol/coordinate';

import {
  createBasemapLayers,
  createDataLayers,
  createHighlightLayer,
  createAoiLayer,
  loadAoiFeatures,
  setLayerStyle,
} from './layers.js';

const ISLAMABAD = [73.05, 33.68];

const MapView = forwardRef(function MapView(
  { meta, aoi, layerState, basemap, rgbStyle, highlight, onMapClick, onLoadingChange },
  ref,
) {
  const containerRef = useRef(null);
  const mouseRef = useRef(null);
  const mapRef = useRef(null);
  const layersRef = useRef(null);
  const initialLayerState = useRef(layerState);

  const onMapClickRef = useRef(onMapClick);
  const onLoadingRef = useRef(onLoadingChange);
  onMapClickRef.current = onMapClick;
  onLoadingRef.current = onLoadingChange;

  // Imperative controls exposed to the parent.
  useImperativeHandle(ref, () => ({
    fitAoi: () => {
      const src = layersRef.current?.aoi?.getSource();
      const map = mapRef.current;
      if (!src || !map) return;
      const extent = src.getExtent();
      if (extent && extent[0] !== Infinity) {
        map.getView().fit(extent, { padding: [40, 40, 40, 40], duration: 600 });
      }
    },
    resetView: () => {
      mapRef.current?.getView().animate({ center: fromLonLat(ISLAMABAD), zoom: 10, duration: 400 });
    },
  }));

  // ---- 1. create the map once ---------------------------------------------
  useEffect(() => {
    const basemaps = createBasemapLayers();
    const data = createDataLayers(meta, initialLayerState.current);
    const highlightLayer = createHighlightLayer();
    const aoiLayer = createAoiLayer();

    const map = new Map({
      target: containerRef.current,
      layers: [...Object.values(basemaps), ...Object.values(data), aoiLayer, highlightLayer],
      view: new View({ center: fromLonLat(ISLAMABAD), zoom: 10, maxZoom: 19 }),
      controls: defaultControls({ attributionOptions: { collapsible: true } }).extend([
        new ScaleLine({ minWidth: 80 }),
        new MousePosition({
          target: mouseRef.current,
          projection: 'EPSG:4326',
          coordinateFormat: (c) => formatCoord(c, 'Lon {x}, Lat {y}', 4),
          placeholder: 'move over the map',
        }),
      ]),
    });

    // Zoom to the data extent if the API returned one.
    if (meta.extent) {
      map.getView().fit(transformExtent(meta.extent, 'EPSG:4326', 'EPSG:3857'), {
        padding: [40, 40, 40, 40],
      });
    }

    map.on('singleclick', (evt) => {
      const [lon, lat] = toLonLat(evt.coordinate);
      onMapClickRef.current?.({ lon, lat, res: map.getView().getResolution() });
    });

    // Loading indicator: count pending WMS tiles.
    let pending = 0;
    const update = (delta) => {
      pending = Math.max(0, pending + delta);
      onLoadingRef.current?.(pending > 0);
    };
    Object.values(data).forEach((layer) => {
      const source = layer.getSource();
      source.on('tileloadstart', () => update(1));
      source.on(['tileloadend', 'tileloaderror'], () => update(-1));
    });

    mapRef.current = map;
    layersRef.current = { basemaps, data, highlight: highlightLayer, aoi: aoiLayer };
    return () => map.setTarget(undefined);
  }, [meta]);

  // ---- 2. sync layer visibility + opacity ---------------------------------
  useEffect(() => {
    const data = layersRef.current?.data;
    if (!data) return;
    Object.entries(layerState).forEach(([id, s]) => {
      if (id === 'aoi') {
        const aoiLayer = layersRef.current.aoi;
        aoiLayer?.setVisible(!!s.visible);
        aoiLayer?.setOpacity(s.opacity ?? 1);
        return;
      }
      const layer = data[id];
      if (!layer) return;
      layer.setVisible(s.visible);
      layer.setOpacity(s.opacity);
    });
  }, [layerState]);

  // ---- 3. sync basemap ----------------------------------------------------
  useEffect(() => {
    const basemaps = layersRef.current?.basemaps;
    if (!basemaps) return;
    Object.entries(basemaps).forEach(([id, layer]) => layer.setVisible(id === basemap));
  }, [basemap]);

  // ---- 4. sync RGB style (true/false colour) ------------------------------
  useEffect(() => {
    const rgb = layersRef.current?.data?.rgb;
    if (!rgb) return;
    setLayerStyle(rgb, rgbStyle ?? '');
  }, [rgbStyle]);

  // ---- 5. load AOI features when the polygon arrives ----------------------
  useEffect(() => {
    if (!aoi || !layersRef.current?.aoi) return;
    loadAoiFeatures(layersRef.current.aoi, aoi);
  }, [aoi]);

  // ---- 6. highlight click + matched point ---------------------------------
  useEffect(() => {
    const source = layersRef.current?.highlight?.getSource();
    if (!source) return;
    source.clear();
    if (!highlight) return;
    source.addFeature(new Feature({ geometry: new Point(fromLonLat(highlight.click)), kind: 'click' }));
    if (highlight.point) {
      source.addFeature(new Feature({ geometry: new Point(fromLonLat(highlight.point)), kind: 'match' }));
    }
  }, [highlight]);

  return (
    <>
      <div ref={containerRef} className="map" />
      <div ref={mouseRef} className="mouse-position" />
    </>
  );
});

export default MapView;
