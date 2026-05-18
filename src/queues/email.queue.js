/**
 * Email Queue
 * File: src/queues/email.queue.js
 *
 * P2.3: Email processing queue (order confirmations, receipts, etc)
 */

const logger = require('../core/utils/logger');
const { emailQueue } = require('./queue.config');

/**
 * Email job types
 */
const EMAIL_TYPES = {
  ORDER_CONFIRMATION: 'ORDER_CONFIRMATION',
  ORDER_RECEIPT: 'ORDER_RECEIPT',
  REFUND_NOTIFICATION: 'REFUND_NOTIFICATION',
  SUPPORT_EMAIL: 'SUPPORT_EMAIL',
  KYC_NOTIFICATION: 'KYC_NOTIFICATION'
};

/**
 * Process email jobs
 */
const processEmailJob = async (job) => {
  const { type, data } = job.data;

  logger.info(`[EmailQueue] Processing ${type} for ${data.recipientEmail}`);

  try {
    // Simulate email sending (in real app, integrate with Nodemailer/SendGrid)
    await sendEmail(data);

    return {
      success: true,
      emailType: type,
      recipient: data.recipientEmail,
      sentAt: new Date()
    };
  } catch (error) {
    logger.error(`[EmailQueue] Failed to send ${type}:`, error);
    throw error;
  }
};

/**
 * Mock email sending function
 */
const sendEmail = async (emailData) => {
  // Simulate email delivery
  if (!emailData.recipientEmail) {
    throw new Error('Recipient email is required');
  }

  return new Promise((resolve) => {
    setTimeout(() => {
      logger.info(`[EmailQueue] Email sent to ${emailData.recipientEmail}`);
      resolve();
    }, 100);
  });
};

/**
 * Enqueue email job
 */
const enqueueEmail = async (emailType, emailData) => {
  if (!Object.values(EMAIL_TYPES).includes(emailType)) {
    throw new Error(`Invalid email type: ${emailType}`);
  }

  const job = await emailQueue.add(
    {
      type: emailType,
      data: emailData
    },
    {
      attempts: 3,
      backoff: { type: 'exponential', delay: 1000 },
      removeOnComplete: true
    }
  );

  logger.info(`[EmailQueue] Enqueued ${emailType} job ${job.id}`);
  return job;
};

/**
 * Get email queue metrics
 */
const getEmailQueueMetrics = async () => {
  const counts = await emailQueue.getCountsByStates(
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
emailQueue.process(processEmailJob);

module.exports = {
  emailQueue,
  EMAIL_TYPES,
  processEmailJob,
  enqueueEmail,
  getEmailQueueMetrics
};
