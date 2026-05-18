const {
  getPaymentRetryStatus: getRetryStatus,
  recordPaymentFailure,
} = require('../services/paymentRetryService');
const logger = require('../../core/utils/logger');

/**
 * GET /api/v1/payments/:orderId/retry-status
 * Get payment retry eligibility and details
 */
async function getPaymentRetryStatus(req, res) {
  try {
    const userId = req.user?._id;
    const { orderId } = req.params;

    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    if (!orderId) {
      return res.status(400).json({ success: false, message: 'orderId is required' });
    }

    const result = await getRetryStatus(orderId, userId);

    if (result.error) {
      return res.status(400).json({
        success: false,
        message: result.error,
        data: result,
      });
    }

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (err) {
    logger.error('getPaymentRetryStatus error:', { error: err.message });
    return res.status(500).json({
      success: false,
      message: 'Failed to check payment retry status',
    });
  }
}

/**
 * POST /api/v1/payments/:orderId/retry
 * Retry a failed payment
 * Can be triggered:
 * - Automatically by client after delay (exponential backoff)
 * - Manually by user clicking "Retry"
 */
async function retryPayment(req, res) {
  try {
    const userId = req.user?._id;
    const { orderId } = req.params;
    const { platform, paymentMode } = req.body || {};

    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    if (!orderId) {
      return res.status(400).json({ success: false, message: 'orderId is required' });
    }

    if (!platform) {
      return res.status(400).json({
        success: false,
        message: 'platform is required (android|ios)',
      });
    }

    // Check retry eligibility
    const retryStatus = await getRetryStatus(orderId, userId);

    if (retryStatus.error && !retryStatus.canRetry) {
      return res.status(400).json({
        success: false,
        message: retryStatus.error,
        data: retryStatus,
      });
    }

    // Note: Actual retry would call createSession from worldlinePaymentsService
    // This endpoint prepares the retry data
    logger.info('Payment retry initiated', {
      orderId: String(orderId),
      userId: String(userId),
      retryCount: retryStatus.retryCount,
      platform,
    });

    return res.status(200).json({
      success: true,
      message: 'Payment retry prepared. Please initiate new payment session.',
      data: {
        orderId: String(orderId),
        retryCount: retryStatus.retryCount,
        platform,
        paymentMode,
        nextAction: 'createWorldlineSession', // Frontend should call this next
      },
    });
  } catch (err) {
    logger.error('retryPayment error:', { error: err.message });
    return res.status(500).json({
      success: false,
      message: 'Failed to process payment retry',
    });
  }
}

/**
 * POST /api/v1/payments/record-failure
 * Record payment failure for monitoring and retry logic
 */
async function recordFailure(req, res) {
  try {
    const { orderId, reason } = req.body || {};

    if (!orderId || !reason) {
      return res.status(400).json({
        success: false,
        message: 'orderId and reason are required',
      });
    }

    const result = await recordPaymentFailure(orderId, reason);

    return res.status(200).json({
      success: true,
      message: 'Payment failure recorded',
      data: result,
    });
  } catch (err) {
    logger.error('recordFailure error:', { error: err.message });
    return res.status(500).json({
      success: false,
      message: 'Failed to record payment failure',
    });
  }
}

module.exports = {
  getPaymentRetryStatus,
  retryPayment,
  recordFailure,
};
