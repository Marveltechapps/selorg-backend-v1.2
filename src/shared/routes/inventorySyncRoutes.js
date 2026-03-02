const express = require('express');
const router = express.Router();
const inventorySyncController = require('../controllers/inventorySyncController');
const { authenticateToken, cacheMiddleware } = require('../../core/middleware');
const appConfig = require('../../config/app');

/**
 * Real-time Inventory Sync Routes
 */

// POST /api/v1/shared/inventory-sync/warehouse-to-store - Sync from warehouse to store
router.post('/warehouse-to-store', authenticateToken, inventorySyncController.syncWarehouseToStore);

// POST /api/v1/shared/inventory-sync/store-to-warehouse - Sync from store to warehouse
router.post('/store-to-warehouse', authenticateToken, inventorySyncController.syncStoreToWarehouse);

// POST /api/v1/shared/inventory-sync/bulk - Bulk sync
router.post('/bulk', authenticateToken, inventorySyncController.bulkSync);

// GET /api/v1/shared/inventory-sync/status - Get sync status
router.get('/status', authenticateToken, cacheMiddleware(appConfig.cache.inventorySync), inventorySyncController.getSyncStatus);

module.exports = router;
