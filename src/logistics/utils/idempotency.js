'use strict';

const redis = require('../config/redis');
const logger = require('./logger');

const PREFIX = 'logistics:idempotency:';
const DEFAULT_TTL_SEC = 86400;

/**
 * @returns {Promise<boolean>} true if this is the first time (claim succeeded)
 */
async function claimEventOnce(eventId, ttlSec = DEFAULT_TTL_SEC) {
  if (!eventId) return true;
  try {
    const client = redis.getClient();
    if (!client) return true;
    if (client.status === 'wait' || client.status === 'end') {
      await client.connect().catch(() => {});
    }
    const key = PREFIX + eventId;
    const res = await client.set(key, '1', 'NX', 'EX', ttlSec);
    return res === 'OK';
  } catch (err) {
    logger.warn('[idempotency] redis unavailable; allowing duplicate processing risk', {
      error: err.message,
    });
    return true;
  }
}

module.exports = { claimEventOnce };
