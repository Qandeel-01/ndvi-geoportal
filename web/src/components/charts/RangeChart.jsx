/**
 * NDVI by elevation band: one row per 100 m bin, showing the p10 to p90
 * range as a coloured capsule with a lime dot at the mean.
 *
 * Layout: elevation labels sit in a fixed left column so long strings like
 * "1,100 to 1,200 m" are never overwritten by the plot area. If we ever have
 * more than 16 rows, only every second label is shown to keep the column
 * legible.
 *
 * Animation: capsules grow in width from the left, dots pop in slightly
 * later. SVG transforms need transform-box: fill-box so the scale anchors
 * to the element's own bounding box instead of the SVG viewport.
 */
import { useMemo, useRef } from 'react';
import { useGSAP } from '@gsap/react';
import { formatNumber } from '../../utils/format.js';
import { gsap, reducedMotion } from '../../utils/motion.js';

// Layout constants: labels get their own 76 px column, then a fixed gutter,
// then the plot. Keeping these in one place makes it easy to widen the
// label column if we localise units.
const LABEL_W = 76;
const LABEL_GAP = 10;
const PLOT_PAD_R = 20;
const PLOT_PAD_T = 8;
const PLOT_PAD_B = 22;
const ROW_H = 20;
const SVG_W = 500;

// NDVI axis: values run from -0.2 to 1.0 across the plot area. Keeping this
// consistent with the histogram means the two charts read as one x-axis.
const NDVI_MIN = -0.2;
const NDVI_MAX = 1.0;
const NDVI_SPAN = NDVI_MAX - NDVI_MIN;

export default function RangeChart({ charts }) {
  const scopeRef = useRef(null);

  // Drop empty bands so the chart stays readable in AOIs that only span a
  // small elevation range. useMemo prevents the tween effect from re-running
  // on every render.
  const rows = useMemo(
    () => (charts?.ndviByElevation ?? []).filter((r) => Number(r.count) >= 20),
    [charts],
  );

  // Grow capsules from the left, pop dots in on a slight delay.
  useGSAP(
    () => {
      if (!rows.length) return;
      const caps = gsap.utils.toArray('rect.range-capsule', scopeRef.current);
      const dots = gsap.utils.toArray('circle.range-mean', scopeRef.current);
      caps.forEach((c) => { c.style.transformBox = 'fill-box'; });
      dots.forEach((d) => { d.style.transformBox = 'fill-box'; });
      gsap.set(caps, { transformOrigin: '0% 50%' });
      gsap.set(dots, { transformOrigin: '50% 50%' });
      if (reducedMotion()) {
        gsap.set(caps, { scaleX: 1 });
        gsap.set(dots, { scale: 1 });
        return;
      }
      gsap.fromTo(
        caps,
        { scaleX: 0 },
        { scaleX: 1, duration: 0.5, ease: 'power2.out', stagger: { each: 0.03 } },
      );
      gsap.fromTo(
        dots,
        { scale: 0 },
        { scale: 1, duration: 0.4, ease: 'back.out(2)', stagger: { each: 0.03 }, delay: 0.15 },
      );
    },
    { scope: scopeRef, dependencies: [rows] },
  );

  if (!rows.length) {
    return (
      <div className="range-chart" ref={scopeRef}>
        <div className="log-empty" style={{ marginTop: 8 }}>
          No elevation data yet.
        </div>
      </div>
    );
  }

  // Every second label if the chart is crowded, otherwise show them all.
  const labelEvery = rows.length > 16 ? 2 : 1;

  const chartH = rows.length * ROW_H;
  const H = chartH + PLOT_PAD_T + PLOT_PAD_B;
  const plotX0 = LABEL_W + LABEL_GAP;
  const plotW = SVG_W - plotX0 - PLOT_PAD_R;
  const yFor = (i) => PLOT_PAD_T + i * ROW_H + ROW_H / 2;
  // NDVI value to chart x. NDVI < -0.2 or > 1.0 gets clamped to the edges.
  const xFor = (v) => {
    const t = (Math.max(NDVI_MIN, Math.min(NDVI_MAX, Number(v))) - NDVI_MIN) / NDVI_SPAN;
    return plotX0 + plotW * t;
  };

  // NDVI axis ticks (0.0, 0.5, 1.0), drawn under the last row.
  const ticks = [0, 0.5, 1.0];

  return (
    <div className="range-chart" ref={scopeRef}>
      <svg viewBox={`0 0 ${SVG_W} ${H}`} width="100%" role="img" aria-label="NDVI by elevation band">
        {/* Baseline that visually connects the axis labels to the plot. */}
        <line
          x1={plotX0}
          x2={SVG_W - PLOT_PAD_R}
          y1={H - PLOT_PAD_B + 4}
          y2={H - PLOT_PAD_B + 4}
          stroke="#26262b"
        />
        {rows.map((r, i) => {
          const y = yFor(i);
          // Absolute pixel positions for the capsule and mean dot. Capsule
          // gets a minimum width of 2 px so it stays visible even when p10
          // and p90 are essentially the same value.
          const x0 = xFor(r.p10);
          const x1 = xFor(r.p90);
          const meanX = xFor(r.mean);
          const showLabel = i % labelEvery === 0;
          const bandLabel = `${formatNumber(r.band)} to ${formatNumber(r.band + 100)} m`;
          return (
            <g key={r.band}>
              {showLabel && (
                <text
                  className="range-row-label"
                  x={LABEL_W}
                  y={y + 3}
                  textAnchor="end"
                >
                  {bandLabel}
                </text>
              )}
              <rect
                className="range-capsule"
                x={x0}
                y={y - 4}
                width={Math.max(2, x1 - x0)}
                height={8}
                rx="4"
              />
              <circle className="range-mean" cx={meanX} cy={y} r="4" />
            </g>
          );
        })}
        {ticks.map((t) => (
          <text
            key={t}
            className="axis-tick"
            x={xFor(t)}
            y={H - 6}
            textAnchor="middle"
          >
            {t.toFixed(1)}
          </text>
        ))}
      </svg>
    </div>
  );
}
