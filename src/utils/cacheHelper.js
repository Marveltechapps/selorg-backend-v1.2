/**
 * Cache helper: get from cache or compute and store
 * Used for read-through caching with consistent key and TTL
 */
const cache = require('./cache');
const appConfig = require('../config/app');
const logger = require('../core/utils/logger');

/**
 * Simple hash for object/params to use in cache key (stable string)
 */
function hashForKey(obj) {
  if (obj == null) return '';
  try {
    const str = typeof obj === 'string' ? obj : JSON.stringify(obj);
    let h = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      h = ((h << 5) - h) + char;
      h = h & h;
    }
    return Math.abs(h).toString(36);
  } catch {
    return '';
  }
}

/**
 * Get value from cache or compute via fn(), then set in cache and return.
 * Sets res.setHeader('X-Cache', 'HIT'|'MISS') when res is provided.
 * @param {string} key - Cache key
 * @param {number} ttlSeconds - TTL in seconds
 * @param {() => Promise<any>} fn - Async function that returns the value
 * @param {object} [res] - Express res; if provided, X-Cache header is set
 * @returns {Promise<{ value: any, fromCache: boolean }>}
 */
async function getCachedOrCompute(key, ttlSeconds, fn, res = null) {
  const skipCache = appConfig.disableCache;
  if (skipCache) {
    const value = await fn();
    if (res) res.setHeader('X-Cache', 'MISS');
    return { value, fromCache: false };
  }

  const cached = await cache.get(key);
  if (cached != null) {
    logger.debug('Cache HIT', { key });
    if (res) res.setHeader('X-Cache', 'HIT');
    return { value: cached, fromCache: true };
  }

  logger.debug('Cache MISS', { key });
  const value = await fn();
  await cache.set(key, value, ttlSeconds);
  if (res) res.setHeader('X-Cache', 'MISS');
  return { value, fromCache: false };
}

module.exports = {
  hashForKey,
  getCachedOrCompute,
};
