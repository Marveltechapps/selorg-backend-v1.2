'use strict';

/**
 * Shared Redis configuration for optional caching, queues, and pub/sub.
 * Local dev works without Redis unless REDIS_URL or REDIS_ENABLED is set.
 */
const logger = require('../core/utils/logger');

let skippedLogEmitted = false;

function isRedisDisabled() {
  const v = String(process.env.DISABLE_REDIS || '').trim().toLowerCase();
  return v === 'true' || v === '1' || v === 'yes';
}

function isRedisConfigured() {
  if (isRedisDisabled()) return false;
  if (String(process.env.REDIS_URL || '').trim()) return true;
  const enabled = String(process.env.REDIS_ENABLED || '').trim().toLowerCase();
  return enabled === 'true' || enabled === '1' || enabled === 'yes';
}

function getRedisUrl() {
  const url = String(process.env.REDIS_URL || '').trim();
  return url || null;
}

function getRedisHostOptions() {
  return {
    host: process.env.REDIS_HOST || 'localhost',
    port: Number(process.env.REDIS_PORT) || 6379,
    password: process.env.REDIS_PASSWORD || undefined,
  };
}

function createIoRedisOptions(extra = {}) {
  return {
    lazyConnect: true,
    maxRetriesPerRequest: 3,
    enableOfflineQueue: false,
    retryStrategy(times) {
      if (times > 5) return null;
      return Math.min(times * 200, 3000);
    },
    ...extra,
  };
}

function attachRedisEventHandlers(client, label = 'redis') {
  let lastErrorLog = 0;
  client.on('error', (err) => {
    const now = Date.now();
    if (now - lastErrorLog < 15000) return;
    lastErrorLog = now;
    logger.warn(`[${label}] ${err.message} (Redis unavailable; using in-memory fallbacks)`);
  });
  client.on('connect', () => logger.info(`[${label}] connected`));
}

function logRedisSkippedOnce() {
  if (skippedLogEmitted) return;
  skippedLogEmitted = true;
  if (isRedisDisabled()) {
    logger.info('[redis] disabled via DISABLE_REDIS');
  } else {
    logger.info('[redis] not configured (set REDIS_URL or REDIS_ENABLED=true); in-memory fallbacks active');
  }
}

module.exports = {
  isRedisDisabled,
  isRedisConfigured,
  getRedisUrl,
  getRedisHostOptions,
  createIoRedisOptions,
  attachRedisEventHandlers,
  logRedisSkippedOnce,
};
