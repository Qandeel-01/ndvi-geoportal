/**
 * GET /api/identify?lon=73.05&lat=33.70&res=9.5&layers=points,ndvi,rgb,dem
 *
 * Answers "what is here?" for a map click, combining four sources:
 *   - points : nearest sample point from PostGIS (KNN search, includes elevation)
 *   - ndvi   : NDVI pixel value from GeoServer (GetFeatureInfo)
 *   - rgb    : RGB + NIR reflectance from GeoServer (GetFeatureInfo)
 *   - dem    : elevation in metres from GeoServer (GetFeatureInfo)
 *
 * The lookups run in parallel. Promise.allSettled means one failing source
 * (e.g. GeoServer restarting) does not hide the others: that layer simply
 * comes back with an `error` field.
 */
import { Router } from 'express';
import { findNearestPoint } from '../services/points.js';
import { getNdviAt, getRgbAt, getDemAt } from '../services/geoserver.js';
import { parseIdentifyQuery, searchRadiusMetres } from '../utils/validate.js';
import { asyncHandler } from '../middleware/errorHandler.js';

const LAYERS = ['points', 'ndvi', 'rgb', 'dem'];
export const identifyRouter = Router();

identifyRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const { lon, lat, res: mapRes, layers } = parseIdentifyQuery(req.query, LAYERS);
    const radius = searchRadiusMetres(mapRes, lat);

    const tasks = {
      points: () => findNearestPoint(lon, lat, radius),
      ndvi: () => getNdviAt(lon, lat),
      rgb: () => getRgbAt(lon, lat),
      dem: () => getDemAt(lon, lat),
    };

    const selected = layers.filter((l) => tasks[l]);
    const results = await Promise.allSettled(selected.map((l) => tasks[l]()));

    const body = { location: { lon, lat } };
    results.forEach((r, i) => {
      const layer = selected[i];
      if (r.status === 'fulfilled') {
        body[layer] = r.value;
      } else {
        console.error(`identify: ${layer} lookup failed:`, r.reason?.message);
        body[layer] = { error: `Could not read ${layer} at this location` };
      }
    });

    res.json(body);
  }),
);
