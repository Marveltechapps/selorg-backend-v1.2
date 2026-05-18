'use strict';

// Register Mongoose models for this module (side-effect)
require('./models/logisticsOrder.model');
require('./models/providerOrder.model');
require('./models/orderStatusHistory.model');
require('./models/webhookEvent.model');
require('./models/logisticsProviderConfig.model');
require('./models/logisticsMetric.model');

const { getConfig } = require('./config/env');
const rabbitmq = require('./config/rabbitmq');
const redis = require('./config/redis');
const logger = require('./utils/logger');
const { startConsumers } = require('./events/startConsumers');

async function bootstrap() {
  const cfg = getConfig();
  if (!cfg.LOGISTICS_ENABLED) {
    logger.info('module disabled (LOGISTICS_ENABLED=false), skipping bootstrap');
    return;
  }

  if (cfg.RABBITMQ_URL) {
    try {
      await rabbitmq.connect();
      await startConsumers();
    } catch (err) {
      logger.error('rabbitmq bootstrap failed (will retry on demand)', { error: err.message });
    }
  } else {
    logger.warn('RABBITMQ_URL not set; event-driven flows are disabled until configured');
  }

  // Lazy-connect Redis client (no failure if Redis is down at boot)
  redis.getClient();

  logger.info('module bootstrap complete');
}

async function shutdown() {
  try { await rabbitmq.close(); } catch (_) { /* ignore */ }
  try { await redis.close(); } catch (_) { /* ignore */ }
}

module.exports = { bootstrap, shutdown };
