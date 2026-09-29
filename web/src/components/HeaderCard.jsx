/**
 * Header card that runs across the top of the dashboard. Mirrors the
 * "Mountain Kilimanjaro" hero row from the reference: title, key metrics,
 * and a chip group for the tech stack.
 *
 * Uses GSAP number counters so figures animate up from 0 on first render.
 */
import { useEffect, useRef, useState } from 'react';
import { countTo } from '../utils/motion.js';
import { formatNumber, formatDate } from '../utils/format.js';

function Counter({ to, decimals = 0, suffix = '' }) {
  const [v, setV] = useState(0);
  const tweenRef = useRef(null);
  useEffect(() => {
    tweenRef.current?.kill();
    tweenRef.current = countTo(to ?? 0, { onUpdate: setV });
    return () => tweenRef.current?.kill();
  }, [to]);
  return (
    <span className="num">
      {formatNumber(v, { decimals })}{suffix}
    </span>
  );
}

export default function HeaderCard({ overview }) {
  const loading = !overview;
  const name = overview?.aoi?.name ?? 'Islamabad Capital Territory + Rawalpindi';
  const acquired = overview?.scene?.acquired;
  const area = overview?.aoi?.areaKm2 ?? 0;
  const elevMin = overview?.terrain?.elevMin ?? null;
  const elevMax = overview?.terrain?.elevMax ?? null;

  return (
    <section className="card header-card" data-anim="header">
      <div className="header-title">
        <div className="label">Area of interest</div>
        <h2>{name}</h2>
        <div className="card-sub">
          Sentinel-2 L2A · Copernicus DEM GLO-30 · {overview?.aoi?.source ?? '-'}
        </div>
      </div>

      <div className="stat">
        <div className="label">Acquired</div>
        <div className="stat-value">{loading ? '-' : formatDate(acquired)}</div>
        <div className="card-sub">
          {overview?.scene?.tiles ? `Tiles ${overview.scene.tiles}` : ' '}
        </div>
      </div>

      <div className="stat">
        <div className="label">Area</div>
        <div className="stat-value">
          <Counter to={area} /> <span className="muted" style={{ fontSize: 13 }}>km²</span>
        </div>
        <div className="card-sub">Pakistan (ADM2)</div>
      </div>

      <div className="stat">
        <div className="label">Elevation range</div>
        <div className="stat-value">
          <Counter to={elevMin ?? 0} /> - <Counter to={elevMax ?? 0} />
          <span className="muted" style={{ fontSize: 13 }}> m</span>
        </div>
        <div className="card-sub">
          mean {overview?.terrain?.elevMean ? Math.round(overview.terrain.elevMean) : '-'} m
        </div>
      </div>

      <div className="stack-chips">
        <span className="chip solid">PostGIS</span>
        <span className="chip solid">GeoServer</span>
        <span className="chip solid">Node</span>
        <span className="chip solid">React</span>
        <span className="chip">Vite</span>
      </div>
    </section>
  );
}
