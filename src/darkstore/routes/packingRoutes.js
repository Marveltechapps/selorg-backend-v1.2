const express = require('express');
const router = express.Router();
const {
  getPackQueue,
  getOrderDetails,
  scanItem,
  completeOrder,
  reportMissingItem,
  reportDamagedItem,
} = require('../controllers/packingController');

// GET /api/darkstore/packing/queue
router.get('/queue', getPackQueue);

// GET /api/darkstore/packing/orders/:orderId
router.get('/orders/:orderId', getOrderDetails);

// POST /api/darkstore/packing/orders/:orderId/scan
router.post('/orders/:orderId/scan', scanItem);

// POST /api/darkstore/packing/orders/:orderId/complete
router.post('/orders/:orderId/complete', completeOrder);

// POST /api/darkstore/packing/orders/:orderId/report-missing
router.post('/orders/:orderId/report-missing', reportMissingItem);

// POST /api/darkstore/packing/orders/:orderId/report-damaged
router.post('/orders/:orderId/report-damaged', reportDamagedItem);

module.exports = router;

