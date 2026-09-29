/**
 * Ridgeline / "joy plot" of the DEM.
 *
 * Each row of the terrain grid (from /api/overview.terrain.ridgeline) becomes
 * one horizontal profile. Rows are drawn from back (top of the AOI) to front
 * (bottom of the AOI) with a filled shape that occludes the row behind, so
 * the whole thing reads like a topographic tapestry.
 *
 * Two design choices that keep the chart legible on non-rectangular AOIs:
 *
 *   1. Row values are normalised against the 1st..99th percentile of the
 *      whole grid, not min..max. Copernicus DEM has a handful of pixels on
 *      Himalayan foothills that would otherwise flatten every "plains" row
 *      to a straight line.
 *
 *   2. Each row is split into CONTIGUOUS segments. A row with a hole (because
 *      the AOI is not rectangular there) is drawn as two separate filled
 *      shapes with a gap between them; without this the fill polygon would
 *      close across the hole and produce spurious trapezoids.
 *
 * Entrance animation uses stroke-dashoffset (safe on SVG, no transform-box
 * dependency). Reduced-motion renders the final state and skips the tween.
 */
import { useMemo, useRef } from 'react';
import { useGSAP } from '@gsap/react';
import { gsap, reducedMotion } from '../../utils/motion.js';

const SVG_W = 600;
const SVG_H = 300;

// Percentile clipping for the y-scale. 1..99 rejects Copernicus DEM outliers
// (isolated peaks) without hiding real relief.
const P_LO = 0.01;
const P_HI = 0.99;

// Amplitude as a multiple of row spacing. Anything above ~3 makes rows
// overlap heavily; below ~1.5 makes the chart look flat.
const AMPLITUDE_FACTOR = 2.2;

// Minimum contiguous run length to draw. A single-cell speck looks like noise.
const MIN_RUN = 2;

/** Return the value at a fraction of a sorted array, linear interpolation. */
function percentile(sortedVals, p) {
  if (!sortedVals.length) return NaN;
  const idx = p * (sortedVals.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sortedVals[lo];
  const t = idx - lo;
  return sortedVals[lo] * (1 - t) + sortedVals[hi] * t;
}

/** Group a row into runs of contiguous defined cells: [{start, values}, ...]. */
function contiguousRuns(row) {
  const runs = [];
  let start = -1;
  let buf = [];
  const flush = () => {
    if (buf.length >= MIN_RUN) runs.push({ start, values: buf });
    buf = [];
    start = -1;
  };
  row.forEach((v, i) => {
    if (v === null || v === undefined || !Number.isFinite(v)) {
      flush();
      return;
    }
    if (start === -1) start = i;
    buf.push(v);
  });
  flush();
  return runs;
}

export default function RidgelineChart({ overview }) {
  const scopeRef = useRef(null);
  const terrain = overview?.terrain;
  const grid = useMemo(() => terrain?.ridgeline ?? [], [terrain]);
  const cols = terrain?.ridgelineCols ?? (grid[0]?.length ?? 0);

  // Turn the raw grid into ready-to-render paths. Memoised so the entrance
  // tween only re-runs when the underlying data actually changes.
  const { paths, vmin, vmax } = useMemo(() => {
    if (!grid.length || !cols) return { paths: [], vmin: 0, vmax: 0 };

    // Rows that are entirely outside the AOI carry no signal; drop them so
    // the layout uses vertical space on rows that actually show terrain.
    const nonEmpty = grid.filter((row) => row.some(
      (v) => v !== null && v !== undefined && Number.isFinite(v),
    ));
    if (!nonEmpty.length) return { paths: [], vmin: 0, vmax: 0 };

    // Percentile-based y-scale so a few Himalayan pixels do not squash the
    // rest of the chart into a straight line.
    const flat = [];
    for (const row of nonEmpty) {
      for (const v of row) {
        if (v !== null && v !== undefined && Number.isFinite(v)) flat.push(v);
      }
    }
    flat.sort((a, b) => a - b);
    const vLo = percentile(flat, P_LO);
    const vHi = percentile(flat, P_HI);
    const span = Math.max(1, vHi - vLo);

    const rowSpacing = SVG_H / (nonEmpty.length + 4);
    const amp = rowSpacing * AMPLITUDE_FACTOR;
    const topPad = rowSpacing * 2;

    // Build the SVG segments. Each row can produce multiple filled shapes if
    // the row has gaps (a hole in the AOI). Each segment gets its own path.
    const built = nonEmpty.map((row, ri) => {
      const baseline = topPad + ri * rowSpacing;
      const runs = contiguousRuns(row);
      const segments = runs.map((run, si) => {
        const x0 = (run.start / (cols - 1)) * SVG_W;
        // Move to the run's left baseline, trace the profile, close to the
        // right baseline. Values are clamped to the percentile window so
        // outliers do not draw outside the chart area.
        let d = `M${x0.toFixed(1)} ${baseline.toFixed(1)}`;
        const strokePoints = [];
        run.values.forEach((v, k) => {
          const clamped = Math.max(vLo, Math.min(vHi, v));
          const t = (clamped - vLo) / span;
          const x = ((run.start + k) / (cols - 1)) * SVG_W;
          const y = baseline - t * amp;
          d += ` L${x.toFixed(1)} ${y.toFixed(1)}`;
          strokePoints.push(`${x.toFixed(1)},${y.toFixed(1)}`);
        });
        const xEnd = ((run.start + run.values.length - 1) / (cols - 1)) * SVG_W;
        d += ` L${xEnd.toFixed(1)} ${baseline.toFixed(1)} Z`;
        // The stroke is only the top of the profile (no vertical closing
        // segments), so it reads as a mountain silhouette not a rectangle.
        const stroke = `M${strokePoints.join(' L')}`;
        return { id: `${ri}-${si}`, fill: d, stroke };
      });
      return { i: ri, segments };
    });
    return { paths: built, vmin: vLo, vmax: vHi };
  }, [grid, cols]);

  useGSAP(
    () => {
      if (!paths.length) return;
      const strokes = gsap.utils.toArray('path[data-stroke="1"]', scopeRef.current);
      if (!strokes.length) return;
      strokes.forEach((p) => {
        const len = p.getTotalLength();
        p.style.strokeDasharray = String(len);
        p.style.strokeDashoffset = String(len);
      });
      if (reducedMotion()) {
        strokes.forEach((p) => { p.style.strokeDashoffset = '0'; });
        return;
      }
      // Draw from back (highest y, top of AOI) to front so the finished
      // chart reads as depth.
      gsap.to(strokes, {
        strokeDashoffset: 0,
        duration: 1.0,
        ease: 'power2.out',
        stagger: { from: 'start', each: 0.02 },
      });
    },
    { scope: scopeRef, dependencies: [paths] },
  );

  if (!paths.length) {
    return (
      <div className="ridgeline" ref={scopeRef}>
        <div className="log-empty" style={{ marginTop: 8 }}>
          Elevation model not loaded yet.
        </div>
      </div>
    );
  }

  return (
    <div className="ridgeline" ref={scopeRef}>
      <svg viewBox={`0 0 ${SVG_W} ${SVG_H}`} preserveAspectRatio="none" role="img" aria-label="Ridgeline of the AOI elevation">
        <defs>
          {/* Fill gradient runs top-to-bottom so nearer rows read as darker
              and further rows read as lighter, adding perceived depth. */}
          <linearGradient id="ridgeFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#1b1b1e" stopOpacity="1" />
            <stop offset="100%" stopColor="#0a0a0b" stopOpacity="1" />
          </linearGradient>
        </defs>
        {/* Paint back-to-front so the fill of a nearer row occludes the row
            behind it, exactly like real terrain would occlude what is behind. */}
        {paths.map((p) => (
          <g key={p.i}>
            {p.segments.map((s) => (
              <path key={`f-${s.id}`} d={s.fill} fill="url(#ridgeFill)" stroke="none" />
            ))}
            {p.segments.map((s) => (
              <path
                key={`s-${s.id}`}
                d={s.stroke}
                data-stroke="1"
                fill="none"
                stroke="#ececec"
                strokeOpacity="0.75"
                strokeWidth="1"
                strokeLinejoin="round"
              />
            ))}
          </g>
        ))}
      </svg>
      <div className="ridge-min-max">
        <span>min {Math.round(overview.terrain.elevMin)} m</span>
        <span>
          <span className="muted" style={{ fontSize: 10, marginRight: 6 }}>
            shown {Math.round(vmin)} to {Math.round(vmax)} m
          </span>
          max {Math.round(overview.terrain.elevMax)} m
        </span>
      </div>
    </div>
  );
}
