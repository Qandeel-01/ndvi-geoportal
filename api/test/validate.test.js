import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseIdentifyQuery,
  searchRadiusMetres,
  ValidationError,
} from '../src/utils/validate.js';

const LAYERS = ['points', 'ndvi', 'rgb', 'dem'];

test('parses a valid identify query', () => {
  const q = parseIdentifyQuery({ lon: '73.05', lat: '33.7', res: '9.5', layers: 'ndvi,rgb,dem' }, LAYERS);
  assert.deepEqual(q, { lon: 73.05, lat: 33.7, res: 9.5, layers: ['ndvi', 'rgb', 'dem'] });
});

test('defaults to all layers and res=10', () => {
  const q = parseIdentifyQuery({ lon: '73', lat: '33' }, LAYERS);
  assert.deepEqual(q.layers, LAYERS);
  assert.equal(q.res, 10);
});

test('accepts dem in the identify layer list', () => {
  const q = parseIdentifyQuery({ lon: '73', lat: '33', layers: 'dem' }, LAYERS);
  assert.deepEqual(q.layers, ['dem']);
});

test('rejects missing and out-of-range coordinates', () => {
  assert.throws(() => parseIdentifyQuery({ lat: '33' }, LAYERS), ValidationError);
  assert.throws(() => parseIdentifyQuery({ lon: '200', lat: '33' }, LAYERS), ValidationError);
  assert.throws(() => parseIdentifyQuery({ lon: 'abc', lat: '33' }, LAYERS), ValidationError);
});

test('rejects unknown layers (no arbitrary input reaches GeoServer)', () => {
  assert.throws(
    () => parseIdentifyQuery({ lon: '73', lat: '33', layers: 'rgb,../../rest' }, LAYERS),
    /Unknown layer/,
  );
});

test('search radius is corrected for latitude and clamped', () => {
  // At the equator 10 px x 5 m = 50 m
  assert.equal(searchRadiusMetres(5, 0), 50);
  // At 60 degrees Web Mercator metres are half as long on the ground
  assert.ok(Math.abs(searchRadiusMetres(10, 60) - 50) < 1e-9);
  // Very zoomed in -> minimum 20 m; very zoomed out -> maximum 1000 m
  assert.equal(searchRadiusMetres(0.1, 33), 20);
  assert.equal(searchRadiusMetres(5000, 33), 1000);
});
