/**
 * NDVI + class colour palette.
 * Mirrors the SLDs (prep/styles/ndvi_ramp.sld, points_ndvi.sld) so on-screen
 * charts match on-map colours exactly.
 */
const RAMP = [
  { at: -0.2, c: '#2c7bb6' },   // water (deep)
  { at: 0.0,  c: '#abd9e9' },   // water (edge)
  { at: 0.1,  c: '#d7a86e' },   // bare/built-up
  { at: 0.25, c: '#fee08b' },   // sparse
  { at: 0.45, c: '#a6d96a' },   // moderate
  { at: 0.65, c: '#1a9641' },   // dense (light)
  { at: 0.85, c: '#00441b' },   // dense (dark)
];

function hexToRgb(h) {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}
function rgbToHex([r, g, b]) {
  const v = (n) => Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, '0');
  return `#${v(r)}${v(g)}${v(b)}`;
}

/** Continuous NDVI colour (interpolated between ramp stops). */
export function ndviColor(v) {
  if (v === null || v === undefined || Number.isNaN(v)) return '#3a3a3f';
  const x = Math.max(RAMP[0].at, Math.min(RAMP[RAMP.length - 1].at, v));
  for (let i = 0; i < RAMP.length - 1; i++) {
    if (x >= RAMP[i].at && x <= RAMP[i + 1].at) {
      const t = (x - RAMP[i].at) / (RAMP[i + 1].at - RAMP[i].at);
      const a = hexToRgb(RAMP[i].c);
      const b = hexToRgb(RAMP[i + 1].c);
      return rgbToHex([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]);
    }
  }
  return RAMP[RAMP.length - 1].c;
}

/** Colour for each NDVI class (matches classify_ndvi in prep/config.py). */
export const CLASS_COLOR = {
  water: '#2c7bb6',
  bare_built: '#d7a86e',
  sparse: '#fee08b',
  moderate: '#a6d96a',
  dense: '#1a9641',
};

export const CLASS_LABEL = {
  water: 'Water',
  bare_built: 'Bare / built-up',
  sparse: 'Sparse vegetation',
  moderate: 'Moderate vegetation',
  dense: 'Dense vegetation',
};

/** Ordered list of classes, matches config.NDVI_CLASSES order. */
export const CLASSES = ['water', 'bare_built', 'sparse', 'moderate', 'dense'];

/** CSS gradient for a legend chip that spans NDVI_MIN..NDVI_MAX. */
export function ndviGradient() {
  const stops = RAMP.map((r) => {
    const t = (r.at - RAMP[0].at) / (RAMP[RAMP.length - 1].at - RAMP[0].at);
    return `${r.c} ${(t * 100).toFixed(1)}%`;
  }).join(', ');
  return `linear-gradient(90deg, ${stops})`;
}
