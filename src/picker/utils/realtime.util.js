/**
 * Real-time utilities – YAML compliance: no blocking, instant response, fallbacks.
 * - withTimeout: avoid infinite waits (external/DB calls)
 * - safeAsync: wrap async fn with try/catch, never throw
 */
const DB_TIMEOUT_MS = 5000;
const EXTERNAL_TIMEOUT_MS = 3000;

const withTimeout = (promise, ms = DB_TIMEOUT_MS, fallback = null) => {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Operation timed out')), ms)
    ),
  ]).catch((err) => {
    if (fallback !== undefined && fallback !== null) return fallback;
    throw err;
  });
};

const safeAsync = async (fn, fallback) => {
  try {
    return await fn();
  } catch (err) {
    if (fallback !== undefined && fallback !== null) return fallback;
    throw err;
  }
};

module.exports = {
  withTimeout,
  safeAsync,
  DB_TIMEOUT_MS,
  EXTERNAL_TIMEOUT_MS,
};
