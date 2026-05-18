'use strict';

const Redis = require('ioredis');
const {
  isRedisConfigured,
  getRedisUrl,
  getRedisHostOptions,
  createIoRedisOptions,
  attachRedisEventHandlers,
  logRedisSkippedOnce,
} = require('../../../utils/redisConnection');

let redisClient = null;

function getRedisClient() {
  if (!isRedisConfigured()) {
    logRedisSkippedOnce();
    return null;
  }
  if (redisClient) return redisClient;

  const url = getRedisUrl();
  const opts = createIoRedisOptions();
  redisClient = url
    ? new Redis(url, opts)
    : new Redis({ ...getRedisHostOptions(), ...opts });

  attachRedisEventHandlers(redisClient, 'rider-redis');
  return redisClient;
}

async function disconnectRedis() {
  if (!redisClient) return;
  try {
    await redisClient.quit();
  } catch (_) {
    /* ignore */
  }
  redisClient = null;
}

module.exports = { getRedisClient, disconnectRedis };
