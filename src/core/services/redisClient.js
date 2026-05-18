/**
 * Shared Redis client for optional caching (platform config, etc.).
 * Uses same env vars as payment idempotency middleware.
 */
const Redis = require('ioredis');
const logger = require('../utils/logger');

let client = null;
let disabled = false;

function getRedisClient() {
  if (disabled) return null;
  if (client) return client;
  try {
    client = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: Number(process.env.REDIS_PORT) || 6379,
      password: process.env.REDIS_PASSWORD || undefined,
      maxRetriesPerRequest: 2,
      retryStrategy: (times) => Math.min(times * 50, 2000),
    });
    client.on('error', (err) => {
      logger.warn('[redisClient]', { error: err.message });
    });
    client.on('connect', () => logger.info('[redisClient] connected'));
  } catch (e) {
    logger.warn('[redisClient] unavailable', { error: e.message });
    disabled = true;
    return null;
  }
  return client;
}

module.exports = { getRedisClient };
