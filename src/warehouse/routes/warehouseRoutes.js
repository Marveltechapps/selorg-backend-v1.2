const express = require('express');
const router = express.Router();
const warehouseController = require('../controllers/warehouseController');

router.get('/metrics', warehouseController.getMetrics);
router.get('/order-flow', warehouseController.getOrderFlow);
router.get('/reports/daily', warehouseController.getDailyReport);
router.get('/reports/operations-view', warehouseController.getOperationsView);
router.get('/analytics', warehouseController.getAnalytics);

module.exports = router;

