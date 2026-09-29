/**
 * Floating "glass" layer panel that sits over the map.
 * Custom toggle switches + opacity sliders for each layer. RGB has an
 * extra True / False colour segment that flips the WMS STYLES parameter.
 */
const LAYERS = [
  { id: 'rgb',       label: 'True colour',    hint: 'Sentinel-2 RGB + NIR' },
  { id: 'ndvi',      label: 'NDVI',           hint: 'cloud masked, AOI clipped' },
  { id: 'dem',       label: 'Elevation',      hint: 'Copernicus DEM GLO-30' },
  { id: 'hillshade', label: 'Hillshade',      hint: 'shaded relief' },
  { id: 'contours',  label: 'Contours',       hint: 'every 100 m' },
  { id: 'points',    label: 'Sample points',  hint: 'stratified random' },
  { id: 'aoi',       label: 'AOI boundary',   hint: 'Islamabad + Rawalpindi' },
];

export default function LayerPanel({ layerState, onChange, rgbStyle, onRgbStyle }) {
  const setLayer = (id, patch) => {
    onChange({ ...layerState, [id]: { ...layerState[id], ...patch } });
  };
  return (
    <div className="layer-panel">
      <h4>Layers</h4>
      {LAYERS.map((L) => {
        const s = layerState[L.id] ?? { visible: false, opacity: 1 };
        const showRgbMode = L.id === 'rgb' && s.visible;
        return (
          <div key={L.id} className={`layer-row ${s.visible ? '' : 'off'}`}>
            <label className="layer-head">
              <div>
                <strong>{L.label}</strong>
                <small>{L.hint}</small>
              </div>
              <span className="switch">
                <input
                  type="checkbox"
                  checked={!!s.visible}
                  onChange={(e) => setLayer(L.id, { visible: e.target.checked })}
                  aria-label={`Toggle ${L.label}`}
                />
                <span className="track" />
                <span className="knob" />
              </span>
            </label>

            {s.visible && (
              <>
                <input
                  type="range"
                  className="opacity-slider"
                  min="0"
                  max="1"
                  step="0.05"
                  value={s.opacity}
                  onChange={(e) => setLayer(L.id, { opacity: Number(e.target.value) })}
                  aria-label={`${L.label} opacity`}
                />
                <div className="opacity-label">
                  <span>Opacity</span>
                  <span className="num">{Math.round(s.opacity * 100)}%</span>
                </div>
                {showRgbMode && (
                  <div className="rgb-mode" role="group" aria-label="RGB style">
                    <button
                      type="button"
                      className={!rgbStyle || rgbStyle === 'rgb_stretch' ? 'active' : ''}
                      onClick={() => onRgbStyle?.('')}
                    >
                      True
                    </button>
                    <button
                      type="button"
                      className={rgbStyle === 'false_color' ? 'active' : ''}
                      onClick={() => onRgbStyle?.('false_color')}
                    >
                      False
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
