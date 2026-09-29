/**
 * Central error handling. Every route passes errors here via next(err).
 * Validation errors return their message (400); anything else is logged
 * server-side and returns a generic 500 so internal details never leak.
 */

// eslint-disable-next-line no-unused-vars -- Express needs the 4-argument signature
export function errorHandler(err, req, res, next) {
  const status = err.status ?? 500;
  if (status >= 500) {
    console.error(`[${req.method} ${req.originalUrl}]`, err);
  }
  res.status(status).json({
    error: status >= 500 ? 'Internal server error' : err.message,
  });
}

export function notFound(req, res) {
  res.status(404).json({ error: `Route not found: ${req.method} ${req.path}` });
}

/** Wrap async route handlers so rejected promises reach the error handler. */
export const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
