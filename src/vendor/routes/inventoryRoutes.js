const express = require('express');
const router = express.Router();
const inventoryController = require('../controllers/inventoryController');

router.get('/hub/aging-alerts', inventoryController.listHubAgingAlerts);
router.get('/:vendorId', inventoryController.getSummary);
router.get('/:vendorId/stock', inventoryController.listStock);
router.post('/:vendorId/sync', inventoryController.postSync);
router.post('/:vendorId/reconcile', inventoryController.postReconcile);
router.get('/:vendorId/aging-alerts', inventoryController.listAgingAlerts);
router.post('/:vendorId/aging-alerts/:alertId/ack', inventoryController.ackAlert);
router.get('/:vendorId/stockouts', inventoryController.getStockouts);
router.get('/:vendorId/aging-inventory', inventoryController.getAgingInventory);
router.get('/:vendorId/supply-performance', inventoryController.getSupplyPerformance);
router.get('/:vendorId/kpis', inventoryController.getKPIs);
router.post('/:vendorId/stockouts/bulk-reorder', inventoryController.postBulkReorder);
router.post('/:vendorId/stockouts/alert-all', inventoryController.postAlertAllVendors);
router.post('/:vendorId/aging-inventory/:itemId/return', inventoryController.postReturn);
router.post('/:vendorId/aging-inventory/:itemId/liquidate', inventoryController.postLiquidate);

module.exports = router;

