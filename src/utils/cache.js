/**
 * Redis caching layer - Backward compatibility wrapper
 * This file provides backward compatibility for controllers using the old cache.js API
 * It re-exports the new cache service with the same interface
 * 
 * @deprecated Use cacheService from '../core/services/cache.service' directly
 */

const cacheService = require('../core/services/cache.service');

// Re-export with backward-compatible API
module.exports = {
  get: (key) => cacheService.get(key),
  set: (key, value, ttlSeconds) => cacheService.set(key, value, ttlSeconds),
  del: (key) => cacheService.del(key),
  delByPattern: (pattern) => cacheService.delByPattern(pattern),
  cacheMiddleware: require('../core/middleware/cache.middleware').cacheMiddleware,
  // Legacy: getRedisClient - return null as we use internal client now
  getRedisClient: () => null,
};
