'use strict';

const rabbitmq = require('../config/rabbitmq');
const { getConfig } = require('../config/env');
const logger = require('../utils/logger');

const ORDER_KEYS = [
  'order.created',
  'order.driver_assigned',
  'order.picked_up',
  'order.in_transit',
  'order.delivered',
  'order.cancelled',
  'order.failed',
];

async function assertTopology() {
  const ch = rabbitmq.getChannel();
  if (!ch) {
    logger.warn('[logistics] topology skipped — no channel');
    return;
  }
  const cfg = getConfig();
  const ex = cfg.LOGISTICS_EXCHANGE;
  const dlx = cfg.LOGISTICS_DLQ_EXCHANGE;

  await ch.assertExchange(ex, 'topic', { durable: true });
  await ch.assertExchange(dlx, 'topic', { durable: true });
  await ch.assertQueue('logistics.dlq', { durable: true });
  await ch.bindQueue('logistics.dlq', dlx, '#');

  const dlArgs = {
    durable: true,
    deadLetterExchange: dlx,
    deadLetterRoutingKey: 'dead',
  };

  await ch.assertQueue('logistics.webhook.process', dlArgs);
  await ch.bindQueue('logistics.webhook.process', ex, 'webhook.received');

  await ch.assertQueue('logistics.notifications', dlArgs);
  for (const key of ORDER_KEYS) {
    await ch.bindQueue('logistics.notifications', ex, key);
  }

  await ch.assertQueue('logistics.analytics', dlArgs);
  for (const key of ORDER_KEYS) {
    await ch.bindQueue('logistics.analytics', ex, key);
  }

  logger.info('[logistics] topology asserted', { exchange: ex });
}

module.exports = { assertTopology, ORDER_KEYS };
