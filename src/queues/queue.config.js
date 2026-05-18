/**
 * Queue Configuration
 * File: src/queues/queue.config.js
 *
 * P2.3: Initializes Bull queues with Redis backend
 * Configures retry logic and processing for async tasks
 */

const Queue = require('bull');
const logger = require('../core/utils/logger');

const REDIS_URL = process.env.REDIS_URL || {
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.REDIS_PORT || 6379,
  password: process.env.REDIS_PASSWORD || undefined
};

// Queue instances
const queues = {};

/**
 * Create queue with standard configuration
 */
const createQueue = (name, options = {}) => {
  const queueOptions = {
    redis: REDIS_URL,
    defaultJobOptions: {
      attempts: options.attempts || 3,
      backoff: {
        type: 'exponential',
        delay: options.backoffDelay || 2000
      },
      removeOnComplete: true,
      removeOnFail: false // Keep failed jobs for inspection
    },
    ...options
  };

  const queue = new Queue(name, queueOptions);

  // Event listeners
  queue.on('error', (error) => {
    logger.error(`[Queue: ${name}] Error:`, error);
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

/**
 * Email Queue: Order confirmations, receipts, support emails
 */
const emailQueue = createQueue('email', {
  attempts: 3,
  backoffDelay: 1000 // 1s, 5s, 30s exponential
});

/**
 * SMS Queue: OTP, order status updates, KYC notifications
 */
const smsQueue = createQueue('sms', {
  attempts: 3,
  backoffDelay: 2000
});

/**
 * Photo Queue: Document uploads, async Didit integration
 */
const photoQueue = createQueue('photo', {
  attempts: 5, // More retries for uploads
  backoffDelay: 5000
});

/**
 * Notification Queue: In-app, push notifications
 */
const notificationQueue = createQueue('notification', {
  attempts: 3,
  backoffDelay: 1000
});

/**
 * Payment Queue: High-priority payment processing
 */
const paymentQueue = createQueue('payment', {
  attempts: 3,
  backoffDelay: 10000, // 10s, 60s, 300s (different backoff for payments)
  priority: 'high'
});

/**
 * Dead Letter Queue: Jobs that failed all retries
 */
const deadLetterQueue = createQueue('dead-letter', {
  attempts: 1
});

/**
 * Store all queues
 */
queues.email = emailQueue;
queues.sms = smsQueue;
queues.photo = photoQueue;
queues.notification = notificationQueue;
queues.payment = paymentQueue;
queues.deadLetter = deadLetterQueue;

/**
 * Get queue by name
 */
const getQueue = (name) => {
  return queues[name];
};

/**
 * Close all queues
 */
const closeAllQueues = async () => {
  const queueNames = Object.keys(queues);

  for (const name of queueNames) {
    try {
      await queues[name].close();
      logger.info(`[Queue] Closed: ${name}`);
    } catch (error) {
      logger.error(`[Queue] Error closing ${name}:`, error);
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
  queues
};
