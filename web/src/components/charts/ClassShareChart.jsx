/**
 * NDVI land-cover share: one capsule bar per class, width proportional to
 * the class's percentage of the sample. Bars grow from the left.
 *
 * Uses HTML divs (not SVG), so we do not need transform-box: fill-box; the
 * default transform-origin (top left) is exactly what we want for width
 * scaling and the width itself already carries the value.
 */
import { useMemo, useRef } from 'react';
import { useGSAP } from '@gsap/react';
import { CLASS_COLOR, CLASS_LABEL, CLASSES } from '../../utils/palette.js';
import { formatNumber } from '../../utils/format.js';
import { gsap, reducedMotion } from '../../utils/motion.js';

export default function ClassShareChart({ charts }) {
  const scopeRef = useRef(null);
  const rows = useMemo(() => charts?.ndviClassShare ?? [], [charts]);

  useGSAP(
    () => {
      if (!rows.length) return;
      const bars = gsap.utils.toArray('.class-bar-inner', scopeRef.current);
      if (!bars.length) return;
      gsap.set(bars, { transformOrigin: '0% 50%' });
      if (reducedMotion()) {
        gsap.set(bars, { scaleX: 1 });
        return;
      }
      gsap.fromTo(
        bars,
        { scaleX: 0 },
        { scaleX: 1, duration: 0.6, ease: 'power2.out', stagger: { each: 0.05 } },
      );
    },
    { scope: scopeRef, dependencies: [rows] },
  );

  if (!rows.length) {
    return (
      <div className="class-share" ref={scopeRef}>
        <div className="log-empty" style={{ marginTop: 8 }}>
          No class breakdown yet.
        </div>
      </div>
    );
  }

  // Preserve the canonical class order (config.NDVI_CLASSES on the Python
  // side) even if the DB returns them out of order for some reason.
  const byClass = new Map(rows.map((r) => [r.class, r]));

  return (
    <div className="class-share" ref={scopeRef}>
      {CLASSES.map((c) => {
        const r = byClass.get(c);
        if (!r) return null;
        const pct = Number(r.pct) || 0;
        return (
          <div key={c} className="class-row">
            <div>
              <span className="swatch" style={{ background: CLASS_COLOR[c] }} />
              {CLASS_LABEL[c]}
            </div>
            <div className="class-bar-outer">
              <div
                className="class-bar-inner"
                style={{
                  width: `${Math.max(1, pct)}%`,
                  background: CLASS_COLOR[c],
                }}
              />
            </div>
            <div className="pct">{formatNumber(pct, { decimals: 1 })}%</div>
          </div>
        );
      })}
    </div>
  );
}
