'use strict';

const rabbitmq = require('../../config/rabbitmq');
const { getConfig } = require('../../config/env');
const logger = require('../../utils/logger');

async function publishOrderEvent(envelope) {
  const ch = rabbitmq.getChannel();
  const cfg = getConfig();
  if (!ch) {
    logger.warn('[logistics] skip publish — rabbit not connected', { event: envelope?.eventType });
    return;
  }
  const key = envelope.eventType;
  const buf = Buffer.from(JSON.stringify(envelope));
  ch.publish(cfg.LOGISTICS_EXCHANGE, key, buf, { persistent: true, contentType: 'application/json' });
}

module.exports = { publishOrderEvent };
