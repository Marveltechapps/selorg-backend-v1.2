const express = require('express');
const router = express.Router();
const { getOrders, callCustomer, markRTO, updateOrder, cancelOrder } = require('../controllers/orderController');

// GET /api/darkstore/orders
router.get('/', getOrders);

// POST /api/darkstore/orders/:orderId/call-customer
router.post('/:orderId/call-customer', callCustomer);

// POST /api/darkstore/orders/:orderId/mark-rto
router.post('/:orderId/mark-rto', markRTO);

// PATCH /api/darkstore/orders/:orderId - update status, urgency
router.patch('/:orderId', updateOrder);

// POST /api/darkstore/orders/:orderId/cancel
router.post('/:orderId/cancel', cancelOrder);

// Explicitly reject GET requests to POST-only endpoints
router.get('/:orderId/call-customer', (req, res) => {
  res.status(405).json({
    success: false,
    error: 'Method not allowed. Use POST method for this endpoint.',
    allowed_methods: ['POST'],
  });
});

router.get('/:orderId/mark-rto', (req, res) => {
  res.status(405).json({
    success: false,
    error: 'Method not allowed. Use POST method for this endpoint.',
    allowed_methods: ['POST'],
  });
});

module.exports = router;

