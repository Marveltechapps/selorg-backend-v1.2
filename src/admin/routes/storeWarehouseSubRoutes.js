const express = require('express');
const router = express.Router();
const storeWarehouseSubController = require('../controllers/storeWarehouseSubController');
const { authenticateToken, cacheMiddleware } = require('../../core/middleware');
const appConfig = require('../../config/app');

// Delivery zones for Store & Warehouse screen (admin-scoped, transforms Zone+Store to DeliveryZone shape)
router.get('/delivery-zones', authenticateToken, cacheMiddleware(appConfig.cache?.admin?.stores ?? 60), storeWarehouseSubController.getDeliveryZones);

// Inventories - admin-scoped proxy to warehouse inventory
router.get('/inventories', authenticateToken, storeWarehouseSubController.getInventories);
router.get('/inventories/:id', authenticateToken, storeWarehouseSubController.getInventoryItemById);

// Stock movements - admin-scoped proxy to warehouse transfers + adjustments
router.get('/stock-movements', authenticateToken, storeWarehouseSubController.getStockMovements);

// GRNs - admin-scoped proxy to warehouse inbound GRNs
router.get('/grns', authenticateToken, storeWarehouseSubController.getGRNs);
router.get('/grns/:id', authenticateToken, storeWarehouseSubController.getGRNById);

// Putaway - admin-scoped proxy to putaway tasks (from darkstore/production or warehouse)
router.get('/putaway', authenticateToken, storeWarehouseSubController.getPutawayTasks);

// Bins (storage locations) - admin-scoped proxy to warehouse locations
router.get('/bins', authenticateToken, storeWarehouseSubController.getBins);
router.get('/bins/:id', authenticateToken, storeWarehouseSubController.getBinById);

module.exports = router;
