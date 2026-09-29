/**
 * Secured reverse proxy in front of GeoServer.
 *
 * The browser never talks to GeoServer directly. Instead it calls
 * /geoserver/<workspace>/wms?... on this API, and only read-only WMS requests
 * for our own workspace are forwarded. Everything else (REST API, admin UI,
 * other workspaces, WFS-T edits) is rejected with 403.
 *
 * Benefits:
 *  - GeoServer stays on the private Docker network
 *  - one origin for the web app, so no CORS configuration on GeoServer
 *  - a single place to add auth, caching or rate limiting later
 */
import { createProxyMiddleware } from 'http-proxy-middleware';
import { config } from '../config.js';

const ALLOWED_REQUESTS = new Set(['getmap', 'getfeatureinfo', 'getlegendgraphic', 'getcapabilities']);
const ALLOWED_PATH = new RegExp(`^/${config.workspace}/(wms|ows)$`);

/** Pure check, exported for unit tests. */
export function isAllowedGeoserverRequest(method, path, query) {
  if (method !== 'GET') return false;
  if (!ALLOWED_PATH.test(path)) return false;
  // Query keys are case-insensitive in OGC services.
  const entry = Object.entries(query).find(([k]) => k.toLowerCase() === 'request');
  const request = String(entry?.[1] ?? '').toLowerCase();
  return ALLOWED_REQUESTS.has(request);
}

function guard(req, res, next) {
  if (isAllowedGeoserverRequest(req.method, req.path, req.query)) return next();
  return res.status(403).json({ error: 'This GeoServer request is not allowed through the proxy' });
}

const proxy = createProxyMiddleware({
  // Express strips the '/geoserver' mount path, so it is added back here.
  target: config.geoserverUrl,
  changeOrigin: true,
  proxyTimeout: 30_000,
  on: {
    proxyRes: (proxyRes) => {
      // Let browsers cache map tiles briefly; the data is static.
      if (!proxyRes.headers['cache-control']) {
        proxyRes.headers['cache-control'] = 'public, max-age=3600';
      }
    },
    error: (err, req, res) => {
      console.error('GeoServer proxy error:', err.message);
      if (!res.headersSent) res.status(502).json({ error: 'GeoServer is unavailable' });
    },
  },
});

export const geoserverProxy = [guard, proxy];
