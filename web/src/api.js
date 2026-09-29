/**
 * Thin client for the Node API. All URLs are relative, so the same build
 * works behind Nginx (Docker) and behind the Vite dev proxy.
 */

async function getJson(url, { signal } = {}) {
  const res = await fetch(url, { signal });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body.error ?? `Request failed (HTTP ${res.status})`);
  }
  return body;
}

export const fetchLayers = () => getJson('/api/layers');
export const fetchStats = () => getJson('/api/stats');
export const fetchOverview = () => getJson('/api/overview');
export const fetchAoi = () => getJson('/api/aoi');
export const fetchCharts = () => getJson('/api/charts');

/**
 * Identify what is under a map click.
 * @param {number} lon, lat  clicked location (WGS84)
 * @param {number} res       current map resolution, metres/pixel (sets the search radius)
 * @param {string[]} layers  which layers to query: points | ndvi | rgb | dem
 * @param {AbortSignal} signal lets the caller cancel a stale request
 */
export function identify({ lon, lat, res, layers }, signal) {
  const params = new URLSearchParams({
    lon: lon.toFixed(6),
    lat: lat.toFixed(6),
    res: res.toFixed(2),
    layers: layers.join(','),
  });
  return getJson(`/api/identify?${params}`, { signal });
}
