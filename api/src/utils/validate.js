/**
 * Input validation helpers.
 *
 * Every value coming from the query string is untrusted: it is parsed,
 * range-checked and rejected with a 400 before it gets anywhere near SQL
 * or GeoServer.
 */

export class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ValidationError';
    this.status = 400;
  }
}

/** Parse a finite number within [min, max] or throw a ValidationError. */
export function parseNumber(raw, name, { min = -Infinity, max = Infinity } = {}) {
  if (raw === undefined || raw === '') {
    throw new ValidationError(`Query parameter "${name}" is required`);
  }
  const value = Number(raw);
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new ValidationError(`"${name}" must be a number between ${min} and ${max}`);
  }
  return value;
}

/**
 * Validate the identify request: lon/lat in WGS84, the current map
 * resolution (metres per pixel in Web Mercator) and which layers to query.
 */
export function parseIdentifyQuery(query, allowedLayers) {
  const lon = parseNumber(query.lon, 'lon', { min: -180, max: 180 });
  const lat = parseNumber(query.lat, 'lat', { min: -85, max: 85 });
  const res = query.res === undefined ? 10 : parseNumber(query.res, 'res', { min: 0.01, max: 200_000 });

  const requested = (query.layers ?? allowedLayers.join(','))
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const unknown = requested.filter((l) => !allowedLayers.includes(l));
  if (unknown.length) {
    throw new ValidationError(`Unknown layer(s): ${unknown.join(', ')}`);
  }
  return { lon, lat, res, layers: requested };
}

/**
 * Search radius for "nearest point" in metres.
 *
 * Web Mercator stretches distances away from the equator, so the map
 * resolution is corrected by cos(latitude) to get true ground metres.
 * A click then searches ~10 screen pixels around the cursor, clamped
 * to a sensible range so a zoomed-out click cannot return a point 20 km away.
 */
export function searchRadiusMetres(res, lat, { pixels = 10, min = 20, max = 1000 } = {}) {
  const groundRes = res * Math.cos((lat * Math.PI) / 180);
  return Math.min(max, Math.max(min, groundRes * pixels));
}
