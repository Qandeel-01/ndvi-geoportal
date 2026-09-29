/**
 * The map card: header (title + basemap segment + action buttons), the
 * OpenLayers map, floating layer panel, legend chip, coordinates readout.
 */
import { useRef } from 'react';
import MapView from '../map/MapView.jsx';
import LayerPanel from './LayerPanel.jsx';
import { BASEMAPS } from '../map/layers.js';
import { ndviGradient } from '../utils/palette.js';

export default function MapCard({
  meta, aoi, layerState, onLayerState,
  basemap, onBasemap,
  rgbStyle, onRgbStyle,
  highlight, onMapClick, onLoadingChange,
  mapApiRef,
}) {
  const internalRef = useRef(null);
  const ref = mapApiRef ?? internalRef;

  return (
    <section className="card map-card" id="map">
      <div className="card-h">
        <div className="card-title">
          <h3>Route covered</h3>
          <span className="card-sub">click the map to identify</span>
        </div>
        <div className="segmented" role="group" aria-label="Basemap">
          {BASEMAPS.map((b) => (
            <button
              key={b.id}
              type="button"
              className={b.id === basemap ? 'active' : ''}
              onClick={() => onBasemap(b.id)}
            >
              {b.title}
            </button>
          ))}
        </div>
        <div className="map-actions">
          <button className="icon-btn" title="Fit AOI" onClick={() => ref.current?.fitAoi()}>⤢</button>
          <button className="icon-btn" title="Reset view" onClick={() => ref.current?.resetView()}>↺</button>
        </div>
      </div>

      <div className="map-wrap">
        <MapView
          ref={ref}
          meta={meta}
          aoi={aoi}
          layerState={layerState}
          basemap={basemap}
          rgbStyle={rgbStyle}
          highlight={highlight}
          onMapClick={onMapClick}
          onLoadingChange={onLoadingChange}
        />
        <LayerPanel
          layerState={layerState}
          onChange={onLayerState}
          rgbStyle={rgbStyle}
          onRgbStyle={onRgbStyle}
        />
        <div className="legend-chip">
          <div>NDVI</div>
          <div className="legend-bar" style={{ background: ndviGradient() }} />
          <div className="legend-labels"><span>-0.2</span><span>0.4</span><span>1.0</span></div>
        </div>
      </div>
    </section>
  );
}
