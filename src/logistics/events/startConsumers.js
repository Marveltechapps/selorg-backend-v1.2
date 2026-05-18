'use strict';

const rabbitmq = require('../config/rabbitmq');
const { assertTopology } = require('./topology');
const { attachWebhookConsumer } = require('./consumers/webhookProcessor.consumer');
const { attachNotificationConsumer } = require('./consumers/notification.consumer');
const { attachAnalyticsConsumer } = require('./consumers/analytics.consumer');
const logger = require('../utils/logger');

let started = false;

async function startConsumers() {
  if (started) return;
  const ch = rabbitmq.getChannel();
  if (!ch) {
    logger.warn('[logistics] consumers not started — no channel');
    return;
  }
  await assertTopology();
  attachWebhookConsumer(ch);
  attachNotificationConsumer(ch);
  attachAnalyticsConsumer(ch);
  started = true;
  logger.info('[logistics] consumers started');
}

module.exports = { startConsumers, assertTopology };
