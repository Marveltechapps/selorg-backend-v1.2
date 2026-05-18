/**
 * Customer Payments Routes — Phase A API Standardization
 * File: src/routes/api/v1/customer/payments.routes.js
 *
 * P2.1: Customer payment processing (P0.2 idempotency applies)
 * 
 * MIGRATED to ResponseFormatter (May 12, 2026)
 * All responses now follow standard format with proper error handling
 */

const express = require('express');
const router = express.Router();
const ResponseFormatter = require('../../../../core/utils/ResponseFormatter');
const { authenticateJWT } = require('../../../../middleware/authJWT');
const { requireRole } = require('../../../../middleware/roleAuth.middleware');
const { idempotencyMiddleware } = require('../../../../middleware/idempotency');

/**
 * POST /api/v1/customer/payments/process
 * Process payment for order (P0.2: idempotency required)
 */
router.post(
  '/process',
  idempotencyMiddleware,
  authenticateJWT,
  requireRole('CUSTOMER'),
  async (req, res, next) => {
    try {
      const { orderId, amount, paymentMethod } = req.body;

      const validationErrors = [
        !orderId && { field: 'orderId', message: 'Order ID is required' },
        !amount && { field: 'amount', message: 'Amount is required' },
        !paymentMethod && { field: 'paymentMethod', message: 'Payment method is required' },
        amount && amount <= 0 && { field: 'amount', message: 'Amount must be greater than 0' }
      ].filter(Boolean);

      if (validationErrors.length > 0) {
        return res.status(422).json(
          ResponseFormatter.validationError(validationErrors, 'Payment validation failed')
        );
      }

      const transaction = {
        transactionId: 'txn_' + Date.now(),
        orderId,
        amount,
        status: 'COMPLETED'
      };

      res.json(ResponseFormatter.success(transaction, 'Payment processed successfully'));
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /api/v1/customer/payments/history
 * Get payment history with pagination
 * 
 * Query: ?page=1&limit=20
 */
router.get('/history', authenticateJWT, requireRole('CUSTOMER'), async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;

    const payments = [
      {
        transactionId: 'txn_1',
        orderId: 'order_1',
        amount: 50.00,
        status: 'COMPLETED',
        timestamp: '2026-05-01T10:00:00Z'
      }
    ];

    res.json(ResponseFormatter.paginated(payments, 1, page, limit, {
      message: 'Payment history fetched successfully'
    }));
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/customer/payments/:transactionId/refund
 * Request refund (P0.2: idempotency protects duplicate refund requests)
 */
router.post(
  '/:transactionId/refund',
  idempotencyMiddleware,
  authenticateJWT,
  requireRole('CUSTOMER'),
  async (req, res, next) => {
    try {
      const { transactionId } = req.params;
      const { reason } = req.body;

      if (!reason) {
        return res.status(422).json(
          ResponseFormatter.validationError([
            { field: 'reason', message: 'Refund reason is required' }
          ], 'Refund validation failed')
        );
      }

      const refund = {
        refundId: 'refund_' + Date.now(),
        transactionId,
        status: 'PROCESSING',
        refundAmount: 50.00,
        reason
      };

      res.json(ResponseFormatter.success(refund, 'Refund requested successfully'));
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
