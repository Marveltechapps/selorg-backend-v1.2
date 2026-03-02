const express = require('express');
const router = express.Router();
const inventoryController = require('../controllers/inventoryController');

router.get('/:vendorId', inventoryController.getSummary);
router.get('/:vendorId/stock', inventoryController.listStock);
router.post('/:vendorId/sync', inventoryController.postSync);
router.post('/:vendorId/reconcile', inventoryController.postReconcile);
router.get('/:vendorId/aging-alerts', inventoryController.listAgingAlerts);
router.post('/:vendorId/aging-alerts/:alertId/ack', inventoryController.ackAlert);
router.get('/:vendorId/stockouts', inventoryController.getStockouts);
router.get('/:vendorId/aging-inventory', inventoryController.getAgingInventory);
router.get('/:vendorId/kpis', inventoryController.getKPIs);

module.exports = router;

