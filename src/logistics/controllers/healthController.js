'use strict';

const mongoose = require('mongoose');
const redis = require('../config/redis');
const rabbitmq = require('../config/rabbitmq');
const { getConfig } = require('../config/env');

async function getHealth(req, res) {
  const cfg = getConfig();

  const dbStatus = mongoose.connection.readyState === 1 ? 'ok' : 'down';

  let redisStatus = 'down';
  try {
    redisStatus = (await redis.ping()) ? 'ok' : 'down';
  } catch (_) {
    /* keep down */
  }

  let rabbitStatus;
  if (!cfg.RABBITMQ_URL) {
    rabbitStatus = 'disabled';
  } else if (rabbitmq.isReady()) {
    rabbitStatus = 'ok';
  } else {
    try {
      await rabbitmq.connect();
      rabbitStatus = rabbitmq.isReady() ? 'ok' : 'down';
    } catch (_) {
      rabbitStatus = 'down';
    }
  }

  const allOk = dbStatus === 'ok' && redisStatus === 'ok' && rabbitStatus !== 'down';

  res.status(allOk ? 200 : 503).json({
    success: allOk,
    service: 'logistics',
    status: allOk ? 'ok' : 'degraded',
    checks: {
      database: dbStatus,
      redis: redisStatus,
      rabbitmq: rabbitStatus,
    },
    enabled: cfg.LOGISTICS_ENABLED,
    timestamp: new Date().toISOString(),
  });
}

module.exports = { getHealth };
