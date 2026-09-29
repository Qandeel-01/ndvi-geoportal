/**
 * Vertical timeline of the last 10 map clicks, styled like the reference
 * "Climbing log". Each entry shows time + coordinates and a detail card
 * with attributes, NDVI value/colour swatch, RGB/NIR reflectance,
 * elevation, and distance to the nearest sample point.
 */
import { ndviColor } from '../utils/palette.js';
import { formatTime, formatLonLat, formatMeters } from '../utils/format.js';

const isSet = (v) => v !== null && v !== undefined;

function Row({ label, value }) {
  return (
    <div className="log-row">
      <span className="label">{label}</span>
      <span className="value">{value}</span>
    </div>
  );
}

function Detail({ entry }) {
  const { result } = entry;
  if (!result) return <div className="log-body">Loading…</div>;
  if (result.error) return <div className="log-body">{result.error}</div>;

  const p = result.points?.found ? result.points.attributes : null;
  const ndviVal = result.ndvi?.value ?? p?.ndvi ?? null;
  const dem = result.dem?.value ?? p?.elevation ?? null;
  const rgb = result.rgb?.noData ? null : result.rgb ?? null;

  return (
    <div className="log-body">
      {isSet(ndviVal) && (
        <Row
          label="NDVI"
          value={
            <span>
              <span className="swatch" style={{ background: ndviColor(ndviVal) }} />
              {ndviVal.toFixed(3)}
            </span>
          }
        />
      )}
      {p?.ndviClass && <Row label="Class" value={p.ndviClass.replace('_', ' ')} />}
      {isSet(dem) && <Row label="Elevation" value={formatMeters(dem)} />}
      {rgb?.reflectance && (
        <>
          <Row
            label="R / G / B"
            value={`${(rgb.reflectance.red).toFixed(3)} · ${(rgb.reflectance.green).toFixed(3)} · ${(rgb.reflectance.blue).toFixed(3)}`}
          />
          {isSet(rgb.reflectance.nir) && (
            <Row label="NIR" value={rgb.reflectance.nir.toFixed(3)} />
          )}
        </>
      )}
      {p && (
        <Row label="Nearest point" value={`${formatMeters(entry.distanceM)}`} />
      )}
      {p?.acquired && <Row label="Acquired" value={p.acquired} />}
      {p?.tile && <Row label="Tile" value={p.tile} />}
    </div>
  );
}

export default function InspectionLog({ entries, onClear, listRef }) {
  return (
    <section className="card log-card" id="log">
      <div className="card-h">
        <div className="card-title"><h3>Inspection log</h3><span className="card-sub">last 10 clicks</span></div>
        <div className="map-actions">
          <button className="btn btn-ghost" type="button" onClick={onClear} disabled={!entries.length}>Clear</button>
        </div>
      </div>
      {entries.length === 0 ? (
        <div className="log-empty">Click anywhere on the map to inspect this location.</div>
      ) : (
        <div className="log-list" ref={listRef}>
          {entries.map((e) => (
            <div key={e.id} className="log-entry" data-log-entry>
              <div className="log-entry-head">
                <span>{formatTime(e.at)}</span>
                <span className="num">{formatLonLat(e.click.lon, e.click.lat, 4)}</span>
              </div>
              <Detail entry={e} />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
