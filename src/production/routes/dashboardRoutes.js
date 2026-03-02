const express = require('express');
const router = express.Router();
const {
  getDashboardSummary,
  getStaffLoad,
  getStockAlerts,
  getRTOAlerts,
  getLiveOrders,
  refreshDashboard,
} = require('../controllers/dashboardController');
const { getAlertHistory } = require('../controllers/orderController');

// GET /api/darkstore/dashboard/summary
router.get('/summary', getDashboardSummary);

// GET /api/darkstore/dashboard/staff-load
router.get('/staff-load', getStaffLoad);

// GET /api/darkstore/dashboard/stock-alerts
router.get('/stock-alerts', getStockAlerts);

// GET /api/darkstore/dashboard/rto-alerts
router.get('/rto-alerts', getRTOAlerts);

// GET /api/darkstore/dashboard/live-orders
router.get('/live-orders', getLiveOrders);

// POST /api/darkstore/dashboard/refresh
router.post('/refresh', refreshDashboard);

// GET /api/darkstore/dashboard/alert-history
router.get('/alert-history', getAlertHistory);

// Explicitly reject GET requests to POST-only endpoints
router.get('/refresh', (req, res) => {
  res.status(405).json({
    success: false,
    error: 'Method not allowed. Use POST method for this endpoint.',
    allowed_methods: ['POST'],
  });
});

module.exports = router;

