const express = require('express');
const router = express.Router();
const warehouseReportsController = require('../controllers/warehouseReportsController');

router.get('/operational-slas', warehouseReportsController.getOperationalSLAs);
router.get('/operational-slas/export', warehouseReportsController.exportSLAMetrics);

router.get('/inventory-health', warehouseReportsController.getInventoryHealth);
router.get('/inventory-health/export', warehouseReportsController.exportInventoryHealth);

router.get('/productivity', warehouseReportsController.getProductivity);
router.get('/productivity/export', warehouseReportsController.exportProductivity);

router.get('/storage-utilization', warehouseReportsController.getStorageUtilization);
router.get('/output-trends', warehouseReportsController.getOutputTrends);
router.get('/inventory-by-category', warehouseReportsController.getInventoryByCategory);

module.exports = router;

