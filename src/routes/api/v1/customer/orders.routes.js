/**
 * Customer Orders Routes — Phase A API Standardization
 * File: src/routes/api/v1/customer/orders.routes.js
 *
 * P2.1: Customer order management (P0.2 idempotency applies here)
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
 * GET /api/v1/customer/orders
 * Get customer's orders with pagination
 * 
 * Query: ?page=1&limit=20
 */
router.get('/', authenticateJWT, requireRole('CUSTOMER'), async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;

    const orders = [
      {
        orderId: 'order_1',
        status: 'DELIVERED',
        items: 3,
        total: 50.00,
        createdAt: '2026-05-01T10:00:00Z'
      }
    ];

    res.json(ResponseFormatter.paginated(orders, 1, page, limit, {
      message: 'Orders fetched successfully'
    }));
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/customer/orders
 * Create new order (P0.2: idempotency protection)
 */
router.post(
  '/',
  idempotencyMiddleware,
  authenticateJWT,
  requireRole('CUSTOMER'),
  async (req, res, next) => {
    try {
      const { items, deliveryAddress } = req.body;

      if (!items || !deliveryAddress) {
        const validationErrors = [
          !items && { field: 'items', message: 'Items are required' },
          !deliveryAddress && { field: 'deliveryAddress', message: 'Delivery address is required' }
        ].filter(Boolean);
        
        return res.status(422).json(
          ResponseFormatter.validationError(validationErrors, 'Order creation validation failed')
        );
      }

      const newOrder = {
        orderId: 'order_new_123',
        status: 'PENDING',
        total: 50.00
      };

      res.status(201).json(ResponseFormatter.success(newOrder, 'Order created successfully'));
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /api/v1/customer/orders/:orderId
 * Get order details
 */
router.get('/:orderId', authenticateJWT, requireRole('CUSTOMER'), async (req, res, next) => {
  try {
    const { orderId } = req.params;

    const order = {
      orderId,
      status: 'IN_TRANSIT',
      items: [{ name: 'Product 1', quantity: 2, price: 25.00 }],
      total: 50.00,
      deliveryAddress: '123 Main St',
      riderId: 'rider_123'
    };

    res.json(ResponseFormatter.success(order, 'Order fetched successfully'));
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /api/v1/customer/orders/:orderId/cancel
 * Cancel order
 */
router.patch('/:orderId/cancel', authenticateJWT, requireRole('CUSTOMER'), async (req, res, next) => {
  try {
    const { orderId } = req.params;

    const result = {
      orderId,
      status: 'CANCELLED',
      refundAmount: 50.00
    };

    res.json(ResponseFormatter.success(result, 'Order cancelled successfully'));
  } catch (err) {
    next(err);
  }
});

module.exports = router;


module.exports = router;
