/**
 * Small formatting helpers used across the dashboard. Kept together so the
 * numeric look (thousand separators, tabular fractions) stays consistent.
 */
export function formatNumber(n, { decimals = 0 } = {}) {
  if (n === null || n === undefined || Number.isNaN(n)) return '-';
  return n.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function formatMb(mb) {
  if (mb === null || mb === undefined) return '-';
  if (mb >= 1000) return `${(mb / 1000).toFixed(2)} GB`;
  return `${Math.round(mb)} MB`;
}

export function formatMeters(m) {
  if (m === null || m === undefined || Number.isNaN(m)) return '-';
  return `${Math.round(m).toLocaleString('en-US')} m`;
}

export function formatDate(iso) {
  if (!iso) return '-';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function formatTime(iso) {
  if (!iso) return '-';
  const d = new Date(iso);
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function formatLonLat(lon, lat, decimals = 4) {
  return `${lon.toFixed(decimals)}, ${lat.toFixed(decimals)}`;
}
