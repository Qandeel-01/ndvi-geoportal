/**
 * Tiny in-memory cache with a time-to-live.
 *
 * Stats and the data extent scan the whole 1.9M-row table, but the data never
 * changes after loading, so computing them once every few minutes is plenty.
 * Concurrent requests share the same in-flight promise instead of each
 * starting its own query.
 */
export function cached(fn, ttlMs) {
  let value;
  let expires = 0;
  let pending = null;

  return async () => {
    if (Date.now() < expires) return value;
    if (pending) return pending;

    pending = fn()
      .then((result) => {
        value = result;
        expires = Date.now() + ttlMs;
        return result;
      })
      .finally(() => {
        pending = null;
      });
    return pending;
  };
}
