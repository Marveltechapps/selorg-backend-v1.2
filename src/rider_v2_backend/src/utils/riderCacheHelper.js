"use strict";

/**
 * Read-through cache helper for rider app endpoints (Home, Earnings, History, Profile).
 * Uses Redis when available; falls back to compute when Redis is disabled or errors.
 * Key format: rider:{resource}:{id}:{queryHash?}
 * TTLs: profile/stats 30s, orders 15s, payouts/summary 30-60s.
 */

const { cacheService } = require("../services/cache.service.js");
const { getRedisClient } = require("../config/redis.js");

const PREFIX = "rider";

function hasRedis() {
  const client = getRedisClient && getRedisClient();
  return client != null;
}

/**
 * Get from cache or compute and store. Returns plain JSON-serializable value.
 * @param {string} key - Cache key (e.g. rider:profile:rider-123)
 * @param {number} ttlSeconds - TTL in seconds
 * @param {() => Promise<any>} computeFn - Async function returning plain object/array
 * @returns {Promise<any>}
 */
async function getCachedOrCompute(key, ttlSeconds, computeFn) {
  if (!hasRedis()) {
    return computeFn();
  }
  try {
    return await cacheService.getOrSet(key, computeFn, ttlSeconds);
  } catch (err) {
    console.error("[RiderCache] getOrSet error:", err.message);
    return computeFn();
  }
}

/**
 * Invalidate all cache keys for a rider (profile, stats, orders, payouts, earnings).
 * @param {string} riderId
 */
async function invalidateRider(riderId) {
  if (!hasRedis()) return;
  try {
    await cacheService.deletePattern(`${PREFIX}:profile:${riderId}`);
    await cacheService.deletePattern(`${PREFIX}:stats:${riderId}`);
    await cacheService.deletePattern(`${PREFIX}:orders:*`);
    await cacheService.deletePattern(`${PREFIX}:payouts:${riderId}*`);
    await cacheService.deletePattern(`${PREFIX}:earnings:${riderId}*`);
  } catch (err) {
    console.error("[RiderCache] invalidate error:", err.message);
  }
}

/**
 * Invalidate orders cache (all riders; used after deliver/accept/reject).
 */
async function invalidateOrdersForRider() {
  if (!hasRedis()) return;
  try {
    await cacheService.deletePattern(`${PREFIX}:orders:*`);
  } catch (err) {
    console.error("[RiderCache] invalidate orders error:", err.message);
  }
}

/**
 * Invalidate payouts and earnings summary for a rider.
 * @param {string} riderId
 */
async function invalidatePayoutsForRider(riderId) {
  if (!hasRedis()) return;
  try {
    await cacheService.deletePattern(`${PREFIX}:payouts:${riderId}*`);
    await cacheService.deletePattern(`${PREFIX}:earnings:${riderId}*`);
  } catch (err) {
    console.error("[RiderCache] invalidate payouts error:", err.message);
  }
}

module.exports = {
  PREFIX,
  getCachedOrCompute,
  invalidateRider,
  invalidateOrdersForRider,
  invalidatePayoutsForRider,
};
