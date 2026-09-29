import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildGetFeatureInfoUrl, extractBandValues } from '../src/services/geoserver.js';
import { isAllowedGeoserverRequest } from '../src/middleware/geoserverProxy.js';

test('GetFeatureInfo URL queries the centre pixel of a box around the click', () => {
  const url = new URL(
    buildGetFeatureInfoUrl('ndvi', 73, 33.5, { base: 'http://gs/geoserver', workspace: 'ws' }),
  );
  assert.equal(url.pathname, '/geoserver/ws/wms');
  const p = url.searchParams;
  assert.equal(p.get('REQUEST'), 'GetFeatureInfo');
  assert.equal(p.get('VERSION'), '1.1.1'); // lon/lat axis order with EPSG:4326
  assert.equal(p.get('QUERY_LAYERS'), 'ws:ndvi');
  assert.equal(p.get('X'), '50');
  assert.equal(p.get('Y'), '50');
  const [minx, miny, maxx, maxy] = p.get('BBOX').split(',').map(Number);
  assert.ok(Math.abs((minx + maxx) / 2 - 73) < 1e-9);
  assert.ok(Math.abs((miny + maxy) / 2 - 33.5) < 1e-9);
});

test('band values are read in order regardless of GeoServer band names', () => {
  const json = { features: [{ properties: { RED_BAND: 812, GREEN_BAND: 790, BLUE_BAND: 640 } }] };
  assert.deepEqual(extractBandValues(json), [812, 790, 640]);
  assert.equal(extractBandValues({ features: [] }), null);
});

test('proxy only allows read-only WMS requests for our workspace', () => {
  const ws = process.env.GEOSERVER_WORKSPACE ?? 'ndvi_portal';
  assert.equal(isAllowedGeoserverRequest('GET', `/${ws}/wms`, { REQUEST: 'GetMap' }), true);
  assert.equal(isAllowedGeoserverRequest('GET', `/${ws}/wms`, { request: 'getlegendgraphic' }), true);
  // blocked: admin REST API, other workspaces, writes, WFS transactions
  assert.equal(isAllowedGeoserverRequest('GET', '/rest/workspaces', { request: 'GetMap' }), false);
  assert.equal(isAllowedGeoserverRequest('GET', '/topp/wms', { request: 'GetMap' }), false);
  assert.equal(isAllowedGeoserverRequest('POST', `/${ws}/wms`, { request: 'GetMap' }), false);
  assert.equal(isAllowedGeoserverRequest('GET', `/${ws}/ows`, { request: 'Transaction' }), false);
});
