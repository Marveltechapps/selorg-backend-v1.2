const { Order } = require('../models/Order');
const { WorldlinePayment } = require('../models/WorldlinePayment');
const logger = require('../../core/utils/logger');
const crypto = require('crypto');

/**
 * Payment Retry Service
 * Handles payment retry logic with exponential backoff,
 * idempotency key tracking, and SLA monitoring
 */

// Idempotency cache: key -> { orderId, status, result }
// In production, use Redis with TTL
const idempotencyCache = new Map();

/**
 * Generate idempotency key from order details
 * Ensures duplicate requests return same result
 */
function generateIdempotencyKey(userId, cartChecksum, timestamp) {
  const input = `order:${userId}:${cartChecksum}:${timestamp}`;
  return crypto.createHash('sha256').update(input).digest('hex');
}

/**
 * Check if request was already processed
 */
async function checkIdempotency(idempotencyKey) {
  const cached = idempotencyCache.get(idempotencyKey);
  if (cached && cached.expiresAt > Date.now()) {
    logger.info('Idempotency cache hit', { idempotencyKey, status: cached.status });
    return cached.result;
  }
  idempotencyCache.delete(idempotencyKey);
  return null;
}

/**
 * Store request result for idempotency
 */
function storeIdempotencyResult(idempotencyKey, result, ttlMs = 3600000) {
  idempotencyCache.set(idempotencyKey, {
    result,
    status: result.error ? 'error' : 'success',
    expiresAt: Date.now() + ttlMs,
  });
}

/**
 * Calculate retry delay using exponential backoff
 * Retry 1: 2s, Retry 2: 5s, Retry 3: 10s, Retry 4: Manual only
 */
function getRetryDelayMs(retryCount) {
  const delays = [2000, 5000, 10000]; // ms
  return retryCount < delays.length ? delays[retryCount] : null;
}

/**
 * Get payment retry status for failed payment
 */
async function getPaymentRetryStatus(orderId, userId) {
  try {
    const order = await Order.findOne({ _id: orderId, userId });
    if (!order) return { error: 'Order not found' };

    // Find latest payment attempt
    const payment = await WorldlinePayment.findOne(
      { orderId },
      {},
      { sort: { createdAt: -1 } }
    ).lean();

    if (!payment) {
      return { error: 'No payment found', canRetry: true, retryCount: 0 };
    }

    // If payment succeeded, can't retry
    if (payment.status === 'success') {
      return {
        error: 'Payment already successful',
        canRetry: false,
        status: 'success',
      };
    }

    // If payment is pending, don't retry yet
    if (payment.status === 'pending' || payment.status === 'in_progress') {
      return {
        error: 'Payment in progress, please wait',
        canRetry: false,
        status: 'pending',
      };
    }

    // Payment failed - check retry count
    const retryCount = (payment.retryCount || 0) + 1;
    const nextRetryDelayMs = getRetryDelayMs(retryCount - 1);
    const canAutoRetry = nextRetryDelayMs !== null;

    return {
      canRetry: true,
      retryCount,
      nextRetryDelayMs,
      canAutoRetry,
      lastError: payment.statusMessage || 'Payment failed',
      failureTime: payment.updatedAt,
    };
  } catch (err) {
    logger.error('getPaymentRetryStatus error', { orderId, error: err.message });
    return { error: 'Failed to check retry status' };
  }
}

/**
 * Record payment failure for retry logic
 */
async function recordPaymentFailure(orderId, failureReason) {
  try {
    const payment = await WorldlinePayment.findOne(
      { orderId },
      {},
      { sort: { createdAt: -1 } }
    );

    if (payment) {
      payment.retryCount = (payment.retryCount || 0) + 1;
      payment.lastFailureReason = failureReason;
      payment.lastFailureTime = new Date();
      await payment.save();

      logger.info('Payment failure recorded', {
        orderId: String(orderId),
        retryCount: payment.retryCount,
        reason: failureReason,
      });

      return { retryCount: payment.retryCount };
    }
  } catch (err) {
    logger.error('recordPaymentFailure error', { orderId, error: err.message });
  }
  return null;
}

/**
 * Create order with idempotency
 * Prevents duplicate orders from network retries
 */
async function createOrderWithIdempotency(userId, orderData, idempotencyKey) {
  // Check if already processed
  const cached = await checkIdempotency(idempotencyKey);
  if (cached) return cached;

  try {
    const { Order: OrderModel } = require('../models/Order');

    // Create order
    const order = new OrderModel({
      userId,
      ...orderData,
      idempotencyKey, // Store for reference
    });

    await order.save();

    const result = {
      success: true,
      orderId: String(order._id),
      orderNumber: order.orderNumber,
      status: order.status,
    };

    // Store in idempotency cache (1 hour TTL)
    storeIdempotencyResult(idempotencyKey, result, 3600000);

    logger.info('Order created with idempotency', {
      orderId: String(order._id),
      idempotencyKey,
    });

    return result;
  } catch (err) {
    const errorResult = {
      error: err.message || 'Failed to create order',
    };

    // Store error in cache to prevent retry storm
    storeIdempotencyResult(idempotencyKey, errorResult, 300000); // 5 min TTL for errors

    logger.error('createOrderWithIdempotency error', {
      userId: String(userId),
      idempotencyKey,
      error: err.message,
    });

    return errorResult;
  }
}

/**
 * Check if we should auto-retry payment
 */
function shouldAutoRetry(retryCount, timeSinceFailureMs) {
  const delays = [2000, 5000, 10000];
  if (retryCount > delays.length) return false;

  const requiredDelayMs = delays[retryCount - 1];
  return timeSinceFailureMs >= requiredDelayMs;
}

module.exports = {
  generateIdempotencyKey,
  checkIdempotency,
  storeIdempotencyResult,
  getRetryDelayMs,
  getPaymentRetryStatus,
  recordPaymentFailure,
  createOrderWithIdempotency,
  shouldAutoRetry,
};
