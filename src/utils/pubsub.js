/**
 * Shared Pub/Sub — in-memory by default (no Redis required)
 *
 * Real-time events work as soon as the backend runs. No Redis needed.
 * Set REDIS_URL to use Redis for multi-instance deployments.
 */

const { EventEmitter } = require('events');
const logger = require('../core/utils/logger');

const CHANNELS = ['ws:role', 'ws:user', 'ws:room', 'ws:broadcast', 'ws:hhd'];

const bus = new EventEmitter();
bus.setMaxListeners(50);

let redisPub = null;
let redisSub = null;
let useRedis = false;

function publish(channel, payload) {
  const msg = typeof payload === 'string' ? payload : JSON.stringify(payload);
  if (useRedis && redisPub) {
    try {
      redisPub.publish(channel, msg);
    } catch (err) {
      logger.warn('PubSub Redis publish failed', { channel, error: err.message });
    }
  }
  // Always emit to in-memory bus so local subscribers receive events.
  // Handles race when Redis connects after subscribe (subscribe uses bus, publish would use Redis only).
  bus.emit('message', channel, msg);
}

function subscribe(onMessage) {
  if (useRedis && redisSub) {
    redisSub.on('message', onMessage);
    redisSub.subscribe(...CHANNELS, (err) => {
      if (err) logger.warn('PubSub Redis subscribe error', { error: err.message });
    });
    return () => {
      try {
        redisSub.unsubscribe(...CHANNELS);
      } catch (e) { /* ignore */ }
    };
  }
  bus.on('message', onMessage);
  return () => bus.off('message', onMessage);
}

function tryUseRedis() {
  // Use in-memory so real-time works without Redis. Set REDIS_URL + ensure Redis runs for multi-instance.
  const redisUrl = (process.env.REDIS_URL || '').trim();
  if (!redisUrl || process.env.SKIP_REDIS === '1' || process.env.SKIP_REDIS === 'true') {
    logger.info('PubSub: in-memory (real-time works without Redis)');
    return;
  }
  try {
    const Redis = require('ioredis');
    redisPub = new Redis(redisUrl);
    redisSub = new Redis(redisUrl);
    redisPub.once('connect', () => {
      useRedis = true;
      logger.info('PubSub: Redis connected');
    });
    redisPub.once('error', (err) => {
      logger.warn('PubSub: Redis unavailable, using in-memory', { error: err.message });
      try {
        redisPub.disconnect();
        redisSub.disconnect();
      } catch (e) { /* ignore */ }
      redisPub = null;
      redisSub = null;
    });
  } catch (err) {
    logger.warn('PubSub: Redis init failed, using in-memory', { error: err.message });
  }
}

module.exports = {
  publish,
  subscribe,
  tryUseRedis,
  CHANNELS,
};
