/**
 * Queue Configuration
 * File: src/queues/queue.config.js
 *
 * Bull queues use Redis when REDIS_URL or REDIS_ENABLED is set.
 * Otherwise queues are stubbed (no-op) for local development.
 */

const Queue = require('bull');
const logger = require('../core/utils/logger');
const { isRedisConfigured, getRedisUrl, getRedisHostOptions } = require('../utils/redisConnection');

const queues = {};
const noopQueue = {
  add: async () => ({ id: 'noop' }),
  process: () => {},
  on: () => {},
  close: async () => {},
};

function getRedisConnection() {
  const url = getRedisUrl();
  if (url) return url;
  return getRedisHostOptions();
}

const createQueue = (name, options = {}) => {
  if (!isRedisConfigured()) {
    logger.info(`[Queue] Skipped ${name} (Redis not configured)`);
    return noopQueue;
  }

  const queueOptions = {
    redis: getRedisConnection(),
    defaultJobOptions: {
      attempts: options.attempts || 3,
      backoff: {
        type: 'exponential',
        delay: options.backoffDelay || 2000,
      },
      removeOnComplete: true,
      removeOnFail: false,
    },
    ...options,
  };

  const queue = new Queue(name, queueOptions);

  queue.on('error', (error) => {
    logger.warn(`[Queue: ${name}] Error:`, error.message);
  });

  queue.on('failed', (job, error) => {
    logger.warn(`[Queue: ${name}] Job ${job.id} failed:`, error.message);
  });

  queue.on('completed', (job) => {
    logger.info(`[Queue: ${name}] Job ${job.id} completed`);
  });

  logger.info(`[Queue] Initialized: ${name}`);
  return queue;
};

const emailQueue = createQueue('email', { attempts: 3, backoffDelay: 1000 });
const smsQueue = createQueue('sms', { attempts: 3, backoffDelay: 2000 });
const photoQueue = createQueue('photo', { attempts: 5, backoffDelay: 5000 });
const notificationQueue = createQueue('notification', { attempts: 3, backoffDelay: 1000 });
const paymentQueue = createQueue('payment', {
  attempts: 3,
  backoffDelay: 10000,
  priority: 'high',
});
const deadLetterQueue = createQueue('dead-letter', { attempts: 1 });

queues.email = emailQueue;
queues.sms = smsQueue;
queues.photo = photoQueue;
queues.notification = notificationQueue;
queues.payment = paymentQueue;
queues.deadLetter = deadLetterQueue;

const getQueue = (name) => queues[name];

const closeAllQueues = async () => {
  for (const name of Object.keys(queues)) {
    try {
      await queues[name].close();
      logger.info(`[Queue] Closed: ${name}`);
    } catch (error) {
      logger.warn(`[Queue] Error closing ${name}:`, error.message);
    }
  }
};

module.exports = {
  emailQueue,
  smsQueue,
  photoQueue,
  notificationQueue,
  paymentQueue,
  deadLetterQueue,
  getQueue,
  createQueue,
  closeAllQueues,
  queues,
};
