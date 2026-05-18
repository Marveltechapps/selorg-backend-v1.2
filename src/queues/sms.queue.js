/**
 * SMS Queue
 * File: src/queues/sms.queue.js
 *
 * P2.3: SMS processing queue (OTP, status updates, notifications)
 */

const logger = require('../core/utils/logger');
const { smsQueue } = require('./queue.config');

/**
 * SMS job types
 */
const SMS_TYPES = {
  OTP: 'OTP',
  ORDER_STATUS: 'ORDER_STATUS',
  DELIVERY_UPDATE: 'DELIVERY_UPDATE',
  KYC_NOTIFICATION: 'KYC_NOTIFICATION',
  PAYMENT_CONFIRMATION: 'PAYMENT_CONFIRMATION'
};

/**
 * Process SMS jobs
 */
const processSmsJob = async (job) => {
  const { type, data } = job.data;

  logger.info(`[SMSQueue] Processing ${type} for ${data.phoneNumber}`);

  try {
    // Simulate SMS sending (in real app, integrate with Twilio/Nexmo)
    await sendSms(data);

    return {
      success: true,
      smsType: type,
      recipient: data.phoneNumber,
      sentAt: new Date()
    };
  } catch (error) {
    logger.error(`[SMSQueue] Failed to send ${type}:`, error);
    throw error;
  }
};

/**
 * Mock SMS sending function
 */
const sendSms = async (smsData) => {
  // Validate required fields
  if (!smsData.phoneNumber) {
    throw new Error('Phone number is required');
  }

  if (!smsData.message) {
    throw new Error('Message is required');
  }

  return new Promise((resolve) => {
    setTimeout(() => {
      logger.info(`[SMSQueue] SMS sent to ${smsData.phoneNumber}`);
      resolve();
    }, 100);
  });
};

/**
 * Enqueue SMS job
 */
const enqueueSms = async (smsType, smsData) => {
  if (!Object.values(SMS_TYPES).includes(smsType)) {
    throw new Error(`Invalid SMS type: ${smsType}`);
  }

  const job = await smsQueue.add(
    {
      type: smsType,
      data: smsData
    },
    {
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
      removeOnComplete: true
    }
  );

  logger.info(`[SMSQueue] Enqueued ${smsType} job ${job.id}`);
  return job;
};

/**
 * Get SMS queue metrics
 */
const getSmsQueueMetrics = async () => {
  const counts = await smsQueue.getCountsByStates(
    'active',
    'waiting',
    'completed',
    'failed'
  );

  return {
    active: counts.active || 0,
    waiting: counts.waiting || 0,
    completed: counts.completed || 0,
    failed: counts.failed || 0
  };
};

// Set up processor
smsQueue.process(processSmsJob);

module.exports = {
  smsQueue,
  SMS_TYPES,
  processSmsJob,
  enqueueSms,
  getSmsQueueMetrics
};
