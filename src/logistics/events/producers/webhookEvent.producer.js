'use strict';

const rabbitmq = require('../../config/rabbitmq');
const { getConfig } = require('../../config/env');
const logger = require('../../utils/logger');

async function publishWebhookReceived(envelope) {
  const ch = rabbitmq.getChannel();
  const cfg = getConfig();
  if (!ch) {
    logger.warn('[logistics] skip webhook publish — rabbit offline');
    return;
  }
  const buf = Buffer.from(JSON.stringify(envelope));
  ch.publish(cfg.LOGISTICS_EXCHANGE, 'webhook.received', buf, { persistent: true, contentType: 'application/json' });
}

module.exports = { publishWebhookReceived };
