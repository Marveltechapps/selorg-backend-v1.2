'use strict';

const Redis = require('ioredis');
const logger = require('../utils/logger');
const { getConfig } = require('./env');
const {
  isRedisConfigured,
  getRedisUrl,
  createIoRedisOptions,
  attachRedisEventHandlers,
  logRedisSkippedOnce,
} = require('../../utils/redisConnection');

let client = null;

function buildClient() {
  const cfg = getConfig();
  const baseOpts = createIoRedisOptions();
  const url = cfg.REDIS_URL || getRedisUrl();
  if (url) {
    return new Redis(url, baseOpts);
  }
  return new Redis({
    host: cfg.REDIS_HOST,
    port: cfg.REDIS_PORT,
    password: cfg.REDIS_PASSWORD || undefined,
    ...baseOpts,
  });
}

function getClient() {
  if (!isRedisConfigured()) {
    logRedisSkippedOnce();
    return null;
  }
  if (client) return client;
  client = buildClient();
  attachRedisEventHandlers(client, 'logistics-redis');
  return client;
}

async function ping() {
  try {
    const c = getClient();
    if (!c) return false;
    if (c.status === 'wait' || c.status === 'end') {
      await c.connect();
    }
    const reply = await c.ping();
    return reply === 'PONG';
  } catch (err) {
    logger.warn('redis ping failed', { error: err.message });
    return false;
  }
}

async function close() {
  if (!client) return;
  try {
    await client.quit();
  } catch (_) {
    /* ignore */
  } finally {
    client = null;
  }
}

module.exports = { getClient, ping, close };
