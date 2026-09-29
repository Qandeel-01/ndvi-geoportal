/**
 * Metadata endpoints used by the web app on start-up.
 *
 *   GET /api/health    liveness + database connectivity check
 *   GET /api/layers    layer names, titles, alternate styles, and the data extent
 *   GET /api/stats     point counts per NDVI class, table size, scene info
 *   GET /api/overview  everything the header + counters + hero need in one call
 *   GET /api/aoi       AOI polygon as GeoJSON (simplified)
 *   GET /api/charts    NDVI histogram + NDVI-by-elevation + class share
 */
import { Router } from 'express';
import { pool } from '../db.js';
import { config } from '../config.js';
import { cached } from '../utils/cache.js';
import { getPointStats, getPointsExtent } from '../services/points.js';
import { getOverview, getAoiGeoJson } from '../services/meta.js';
import { getCharts } from '../services/charts.js';
import { asyncHandler } from '../middleware/errorHandler.js';

export const metaRouter = Router();

const cachedStats = cached(getPointStats, config.statsCacheMs);
const cachedExtent = cached(getPointsExtent, config.statsCacheMs);
const cachedOverview = cached(getOverview, config.statsCacheMs);
const cachedAoi = cached(getAoiGeoJson, config.statsCacheMs);
const cachedCharts = cached(getCharts, config.statsCacheMs);

metaRouter.get(
  '/health',
  asyncHandler(async (req, res) => {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', database: 'up' });
  }),
);

metaRouter.get(
  '/layers',
  asyncHandler(async (req, res) => {
    const ws = config.workspace;
    res.json({
      workspace: ws,
      wmsUrl: `/geoserver/${ws}/wms`,
      extent: await cachedExtent(),
      layers: [
        { id: 'rgb', name: `${ws}:${config.layers.rgb}`,
          title: 'Sentinel-2 true colour (RGB, 4-band with NIR)', type: 'raster',
          styles: config.alternateStyles.rgb },
        { id: 'ndvi', name: `${ws}:${config.layers.ndvi}`, title: 'NDVI', type: 'raster' },
        { id: 'dem', name: `${ws}:${config.layers.dem}`, title: 'Elevation (Cop DEM GLO-30)', type: 'raster' },
        { id: 'hillshade', name: `${ws}:${config.layers.hillshade}`, title: 'Hillshade', type: 'raster' },
        { id: 'contours', name: `${ws}:${config.layers.contours}`, title: 'Contours (100 m)', type: 'vector' },
        { id: 'points', name: `${ws}:${config.layers.points}`, title: 'Sample points', type: 'vector' },
        { id: 'aoi', name: `${ws}:${config.layers.aoi}`, title: 'AOI boundary', type: 'vector' },
      ],
    });
  }),
);

metaRouter.get(
  '/stats',
  asyncHandler(async (req, res) => {
    res.json(await cachedStats());
  }),
);

metaRouter.get(
  '/overview',
  asyncHandler(async (req, res) => {
    res.json(await cachedOverview());
  }),
);

metaRouter.get(
  '/aoi',
  asyncHandler(async (req, res) => {
    const feature = await cachedAoi();
    if (!feature) return res.status(404).json({ error: 'AOI not loaded yet' });
    res.json(feature);
  }),
);

metaRouter.get(
  '/charts',
  asyncHandler(async (req, res) => {
    res.json(await cachedCharts());
  }),
);
