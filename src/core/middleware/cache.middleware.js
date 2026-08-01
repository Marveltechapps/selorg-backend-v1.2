/**
 * Cache Middleware
 * Provides Express middleware for caching GET request responses
 */

const cacheService = require('../services/cache.service');
const logger = require('../utils/logger');
const appConfig = require('../../config/app');

/**
 * Cache middleware factory
 * Caches GET request responses with configurable TTL.
 * Respects DISABLE_CACHE env; skips caching for health/metrics.
 *
 * @param {number} ttlSeconds - Time to live in seconds (default: 3600)
 * @param {{ skipPaths?: string[], cacheKeyExtra?: (req: object) => string, ttlResolver?: (req: object) => number }} [options]
 * @returns {Function} Express middleware function
 */
const cacheMiddleware = (ttlSeconds = 3600, options = {}) => {
  const { skipPaths = [], cacheKeyExtra, ttlResolver } =
    typeof options === 'object' ? options : {};
  return async (req, res, next) => {
    // Only cache GET requests
    if (req.method !== 'GET') {
      return next();
    }

    const resolvedTtl =
      typeof ttlResolver === 'function' ? Number(ttlResolver(req)) || 0 : ttlSeconds;

    if (!resolvedTtl || resolvedTtl <= 0) {
      return next();
    }

    if (appConfig.disableCache) {
      return next();
    }

    // Skip cache for health checks and metrics
    if (req.path.startsWith('/health') || req.path === '/metrics') {
      return next();
    }

    if (skipPaths.some((p) => req.path === p || req.path.startsWith(p + '/'))) {
      return next();
    }

    const extra =
      typeof cacheKeyExtra === 'function'
        ? String(cacheKeyExtra(req) || '')
        : '';
    const cacheKey = `cache:${req.originalUrl}:${JSON.stringify(req.query)}${extra}`;

    try {
      // Try to get from cache
      const cached = await cacheService.get(cacheKey);
      if (cached) {
        logger.debug('Cache HIT', { key: cacheKey, path: req.path });
        res.setHeader('X-Cache', 'HIT');
        res.setHeader('X-Cache-Key', cacheKey);
        res.setHeader(
          'Cache-Control',
          `public, max-age=${Math.min(resolvedTtl, 120)}, stale-while-revalidate=60`
        );
        return res.json(cached);
      }

      logger.debug('Cache MISS', { key: cacheKey, path: req.path });

      // Store original json method
      const originalJson = res.json.bind(res);
      res.json = function (data) {
        // Cache the response asynchronously (don't block response)
        cacheService.set(cacheKey, data, resolvedTtl).catch((err) => {
          logger.warn('Cache set failed in middleware', {
            key: cacheKey,
            error: err.message,
          });
        });
        res.setHeader('X-Cache', 'MISS');
        res.setHeader('X-Cache-Key', cacheKey);
        res.setHeader(
          'Cache-Control',
          `public, max-age=${Math.min(resolvedTtl, 120)}, stale-while-revalidate=60`
        );
        return originalJson(data);
      };

      next();
    } catch (err) {
      // If cache fails, continue without caching
      logger.warn('Cache middleware error', { error: err.message });
      next();
    }
  };
};

// CommonJS export for backward compatibility
module.exports = { cacheMiddleware };
