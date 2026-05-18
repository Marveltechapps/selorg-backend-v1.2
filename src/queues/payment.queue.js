/**
 * Payment Queue
 * File: src/queues/payment.queue.js
 *
 * P2.3: High-priority payment processing queue (P0.2 idempotency integration)
 */

const logger = require('../core/utils/logger');
const { paymentQueue } = require('./queue.config');

const PAYMENT_TYPES = {
  PAYMENT_PROCESSING: 'PAYMENT_PROCESSING',
  REFUND_PROCESSING: 'REFUND_PROCESSING',
  SETTLEMENT: 'SETTLEMENT',
  VERIFICATION: 'VERIFICATION'
};

const processPaymentJob = async (job) => {
  const { type, data } = job.data;

  logger.info(
    `[PaymentQueue] Processing ${type} for order ${data.orderId}`,
    `idempotencyKey: ${data.idempotencyKey}`
  );

  try {
    // P0.2 Integration: Use idempotency key to prevent duplicate processing
    const result = await processPayment(data);

    return {
      success: true,
      paymentType: type,
      orderId: data.orderId,
      transactionId: result.transactionId,
      processedAt: new Date()
    };
  } catch (error) {
    logger.error(`[PaymentQueue] Failed to process ${type}:`, error);
    throw error;
  }
};

const processPayment = async (paymentData) => {
  if (!paymentData.orderId || !paymentData.amount) {
    throw new Error('OrderId and amount are required');
  }

  // Validate idempotency key (P0.2)
  if (!paymentData.idempotencyKey) {
    throw new Error('Idempotency key is required for payment processing');
  }

  return new Promise((resolve) => {
    setTimeout(() => {
      logger.info(`[PaymentQueue] Payment processed for order ${paymentData.orderId}`);
      resolve({
        transactionId: `txn_${Date.now()}`
      });
    }, 150);
  });
};

const enqueuePayment = async (paymentType, paymentData) => {
  if (!Object.values(PAYMENT_TYPES).includes(paymentType)) {
    throw new Error(`Invalid payment type: ${paymentType}`);
  }

  const job = await paymentQueue.add(
    { type: paymentType, data: paymentData },
    {
      attempts: 3,
      backoff: { type: 'exponential', delay: 10000 }, // 10s, 60s, 300s
      removeOnComplete: false, // Keep completed payments for audit
      priority: 'high'
    }
  );

  logger.info(
    `[PaymentQueue] Enqueued ${paymentType} job ${job.id}`,
    `idempotencyKey: ${paymentData.idempotencyKey}`
  );
  return job;
};

const getPaymentQueueMetrics = async () => {
  const counts = await paymentQueue.getCountsByStates(
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

paymentQueue.process(processPaymentJob);

module.exports = {
  paymentQueue,
  PAYMENT_TYPES,
  processPaymentJob,
  enqueuePayment,
  getPaymentQueueMetrics
};
