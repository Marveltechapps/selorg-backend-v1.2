/**
 * Shared Redis client for optional caching (platform config, etc.).
 */
const Redis = require('ioredis');
const logger = require('../utils/logger');
const {
  isRedisConfigured,
  getRedisUrl,
  getRedisHostOptions,
  createIoRedisOptions,
  attachRedisEventHandlers,
  logRedisSkippedOnce,
} = require('../../utils/redisConnection');

let client = null;

function getRedisClient() {
  if (!isRedisConfigured()) {
    logRedisSkippedOnce();
    return null;
  }
  if (client) return client;

  const url = getRedisUrl();
  const opts = createIoRedisOptions();
  client = url
    ? new Redis(url, opts)
    : new Redis({ ...getRedisHostOptions(), ...opts });

  attachRedisEventHandlers(client, 'redisClient');
  return client;
}

module.exports = { getRedisClient };
