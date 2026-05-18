/**
 * Rider Deliveries Routes
 * File: src/routes/api/v1/rider/deliveries.routes.js
 *
 * P2.1: Rider delivery management
 */

const express = require('express');
const router = express.Router();
const { authenticateJWT } = require('../../../../middleware/authJWT');
const { requireRole } = require('../../../../middleware/roleAuth.middleware');
const ResponseFormatter = require('../../../../core/utils/ResponseFormatter');

/**
 * GET /api/v1/rider/deliveries
 * Get rider's deliveries
 */
router.get('/', authenticateJWT, requireRole('RIDER'), async (req, res, next) => {
  try {
    const data = [
      {
        deliveryId: 'del_1',
        orderId: 'order_123',
        status: 'IN_TRANSIT',
        pickupLocation: '123 Main St',
        dropoffLocation: '456 Oak Ave',
        estimatedTime: '30 mins',
      },
    ];
    res.status(200).json(ResponseFormatter.success({ deliveries: data }, 'Deliveries'));
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/rider/deliveries/:deliveryId
 * Get delivery details
 */
router.get('/:deliveryId', authenticateJWT, requireRole('RIDER'), async (req, res, next) => {
  try {
    const { deliveryId } = req.params;
    const data = {
      deliveryId,
      orderId: 'order_123',
      status: 'IN_TRANSIT',
      customerName: 'John Doe',
      phone: '+1234567890',
      address: '456 Oak Ave',
      items: [{ name: 'Package', quantity: 1 }],
    };
    res.status(200).json(ResponseFormatter.success({ delivery: data }, 'Delivery detail'));
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /api/v1/rider/deliveries/:deliveryId/status
 * Update delivery status
 */
router.patch('/:deliveryId/status', authenticateJWT, requireRole('RIDER'), async (req, res, next) => {
  try {
    const { deliveryId } = req.params;
    const { status } = req.body;

    if (!status) {
      return res
        .status(422)
        .json(ResponseFormatter.validationError([{ field: 'status', message: 'Status required' }]));
    }

    res
      .status(200)
      .json(ResponseFormatter.success({ deliveryId, status }, `Delivery status updated to ${status}`));
  } catch (err) {
    next(err);
  }
});

module.exports = router;
