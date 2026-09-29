/**
 * Shared PostgreSQL connection pool.
 *
 * A pool re-uses a small number of open connections instead of opening a new
 * one for every request, which is much faster and protects the database from
 * connection storms when many users click on the map at once.
 */
import pg from 'pg';
import { config } from './config.js';

export const pool = new pg.Pool({
  connectionString: config.databaseUrl,
  max: 10,
  idleTimeoutMillis: 30_000,
  // Never let a slow query hold a request forever.
  statement_timeout: 10_000,
});

pool.on('error', (err) => {
  // Errors on idle clients (e.g. the DB restarted) should not crash the API.
  console.error('Unexpected PostgreSQL pool error:', err.message);
});
