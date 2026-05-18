'use strict';

const Redis = require('ioredis');
const logger = require('../utils/logger');
const { getConfig } = require('./env');

let client = null;

function buildClient() {
  const cfg = getConfig();
  const baseOpts = { lazyConnect: true, maxRetriesPerRequest: 3, enableOfflineQueue: false };
  if (cfg.REDIS_URL) {
    return new Redis(cfg.REDIS_URL, baseOpts);
  }
  return new Redis({
    host: cfg.REDIS_HOST,
    port: cfg.REDIS_PORT,
    password: cfg.REDIS_PASSWORD || undefined,
    ...baseOpts,
  });
}

function getClient() {
  if (client) return client;
  client = buildClient();
  client.on('error', (err) => logger.error('redis error', { error: err.message }));
  client.on('connect', () => logger.info('redis connected'));
  client.on('close', () => logger.warn('redis connection closed'));
  return client;
}

async function ping() {
  try {
    const c = getClient();
    if (c.status === 'wait' || c.status === 'end') {
      await c.connect();
    }
    const reply = await c.ping();
    return reply === 'PONG';
  } catch (err) {
    logger.error('redis ping failed', { error: err.message });
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
