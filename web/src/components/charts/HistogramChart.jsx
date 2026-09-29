/**
 * NDVI histogram: vertical bars coloured by the NDVI ramp, with a lime
 * highlight on the modal bucket.
 *
 * Animation notes:
 *   1. SVG elements need `transform-box: fill-box` for CSS-style transforms
 *      to scale about their own bounding box; without it, browsers resolve
 *      `transform-origin` against the outer SVG viewport and bars collapse
 *      off-canvas (this is exactly the bug the first version had).
 *   2. useGSAP scopes the tween to the chart container and disposes tweens
 *      on unmount, so a re-render never leaves nodes stuck at scaleY(0).
 *   3. reducedMotion() renders the final visible state and never runs a tween.
 */
import { useMemo, useRef } from 'react';
import { useGSAP } from '@gsap/react';
import { ndviColor } from '../../utils/palette.js';
import { formatNumber } from '../../utils/format.js';
import { gsap, reducedMotion } from '../../utils/motion.js';

export default function HistogramChart({ charts }) {
  const scopeRef = useRef(null);
  const hist = charts?.ndviHistogram;

  // Precompute what the SVG needs from the API payload, memoised so the tween
  // effect below only re-runs when the underlying data actually changes.
  const { bars, maxCount, total, modeIdx } = useMemo(() => {
    const buckets = hist?.buckets ?? [];
    if (!buckets.length) return { bars: [], maxCount: 0, total: 0, modeIdx: -1 };
    let maxC = 0;
    let sum = 0;
    let mode = -1;
    buckets.forEach((b, i) => {
      const c = Number(b.count) || 0;
      sum += c;
      if (c > maxC) { maxC = c; mode = i; }
    });
    return { bars: buckets, maxCount: maxC, total: sum, modeIdx: mode };
  }, [hist]);

  // Bar entrance: scale up from the axis. useGSAP re-runs when bars change,
  // so bars appear as soon as the API data arrives, not on first mount only.
  useGSAP(
    () => {
      if (!bars.length) return;
      const nodes = gsap.utils.toArray('rect.bar', scopeRef.current);
      if (!nodes.length) return;
      // Anchor the scale to the bar's own bottom edge (see file header).
      gsap.set(nodes, { transformOrigin: '50% 100%' });
      nodes.forEach((n) => { n.style.transformBox = 'fill-box'; });
      if (reducedMotion()) {
        gsap.set(nodes, { scaleY: 1 });
        return;
      }
      gsap.fromTo(
        nodes,
        { scaleY: 0 },
        { scaleY: 1, duration: 0.6, ease: 'power3.out', stagger: { each: 0.015, from: 'start' } },
      );
    },
    { scope: scopeRef, dependencies: [bars] },
  );

  // Empty state: never render zero-height bars, which look like the chart is broken.
  if (!bars.length || maxCount === 0 || total === 0) {
    return (
      <div className="hist" ref={scopeRef}>
        <div className="log-empty" style={{ marginTop: 8 }}>
          No NDVI samples available yet.
        </div>
      </div>
    );
  }

  const W = 500;
  const H = 200;
  const padL = 30;
  const padR = 10;
  const padT = 12;
  const padB = 22;
  const chartW = W - padL - padR;
  const chartH = H - padT - padB;
  const barW = chartW / bars.length;

  // X-axis ticks map an NDVI value to a chart x. Ticks are labelled every 0.25.
  const tickAt = (v) => padL + chartW * ((v - hist.min) / (hist.max - hist.min));
  const ticks = [0, 0.25, 0.5, 0.75, 1.0];

  return (
    <div className="hist" ref={scopeRef}>
      <div className="hist-total">
        <span className="num">{formatNumber(total)}</span>
        <span className="label">sample points</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="NDVI histogram">
        {/* Y baseline: same line the bars grow up from. */}
        <line x1={padL} x2={W - padR} y1={H - padB} y2={H - padB} stroke="#26262b" />
        {bars.map((b, i) => {
          const mid = (b.lo + b.hi) / 2;
          const color = i === modeIdx ? '#d6f58a' : ndviColor(mid);
          const h = chartH * (b.count / maxCount);
          return (
            <rect
              key={i}
              className="bar"
              x={padL + i * barW + 1}
              y={H - padB - h}
              width={Math.max(1, barW - 2)}
              height={Math.max(0.5, h)}
              fill={color}
              rx="2"
              opacity="0.92"
            />
          );
        })}
        {ticks.map((t) => (
          <g key={t}>
            <line x1={tickAt(t)} x2={tickAt(t)} y1={H - padB} y2={H - padB + 3} stroke="#3a3a3f" />
            <text className="axis-tick" x={tickAt(t)} y={H - 6} textAnchor="middle">
              {t.toFixed(2)}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}
