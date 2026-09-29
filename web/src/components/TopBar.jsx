/**
 * Pill nav top bar. The active pill slides via a positioned background so
 * the underline animation matches the reference dashboard's look.
 */
import { useEffect, useRef } from 'react';

const NAV = [
  { id: 'overview', label: 'Overview' },
  { id: 'map', label: 'Map' },
  { id: 'insights', label: 'Insights' },
  { id: 'log', label: 'Log' },
  { id: 'docs', label: 'Docs' },
];

export default function TopBar({ active, onNav, onFitAoi }) {
  const pillRef = useRef(null);
  const linksRef = useRef({});

  // Move the sliding pill background under the active link.
  useEffect(() => {
    const el = linksRef.current[active];
    const pill = pillRef.current;
    if (!el || !pill) return;
    const { offsetLeft, offsetWidth } = el;
    pill.style.transform = `translateX(${offsetLeft}px)`;
    pill.style.width = `${offsetWidth}px`;
  }, [active]);

  return (
    <header className="topbar">
      <div className="brand">
        <span className="brand-mark" aria-hidden="true" />
        <span>terra <span style={{ color: 'var(--muted)' }}>·</span> ndvi</span>
        <small>Islamabad + Rawalpindi</small>
      </div>

      <nav className="nav" role="tablist" aria-label="Sections">
        <div ref={pillRef} className="nav-pill" />
        {NAV.map((n) => (
          <a
            key={n.id}
            ref={(el) => { if (el) linksRef.current[n.id] = el; }}
            className={n.id === active ? 'active' : ''}
            href={`#${n.id}`}
            onClick={(e) => { e.preventDefault(); onNav?.(n.id); }}
          >
            {n.label}
          </a>
        ))}
      </nav>

      <div className="top-actions">
        <button className="btn btn-primary" onClick={onFitAoi} type="button">
          Fit AOI
        </button>
      </div>
    </header>
  );
}
