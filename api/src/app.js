/**
 * Express application setup (kept separate from server.js so tests can import
 * the app without opening a port).
 *
 * Request flow:
 *   helmet / cors / compression / logging
 *     -> /api/*        JSON endpoints (identify, stats, layers, health)
 *     -> /geoserver/*  whitelisted WMS proxy to GeoServer
 *     -> 404 / central error handler
 */
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import morgan from 'morgan';

import { config } from './config.js';
import { identifyRouter } from './routes/identify.js';
import { metaRouter } from './routes/meta.js';
import { geoserverProxy } from './middleware/geoserverProxy.js';
import { errorHandler, notFound } from './middleware/errorHandler.js';

export function createApp() {
  const app = express();

  app.disable('x-powered-by');
  // Security headers. CORP is relaxed so map tiles served through the proxy
  // can be displayed by the web app during local development (Vite on :5173).
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(cors({ origin: config.corsOrigin }));
  app.use(morgan('tiny'));

  // Map images are already compressed (PNG/JPEG), so only compress JSON.
  app.use('/api', compression());
  app.use('/api/identify', identifyRouter);
  app.use('/api', metaRouter);

  app.use('/geoserver', ...geoserverProxy);

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
