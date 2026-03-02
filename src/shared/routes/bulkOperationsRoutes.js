const express = require('express');
const router = express.Router();
const bulkOperationsController = require('../controllers/bulkOperationsController');
const { authenticateToken, cacheMiddleware } = require('../../core/middleware');
const appConfig = require('../../config/app');

/**
 * Bulk Operations Routes
 */

// POST /api/v1/shared/bulk/orders - Bulk update orders
router.post('/orders', authenticateToken, bulkOperationsController.bulkUpdateOrders);

// POST /api/v1/shared/bulk/products - Bulk update products
router.post('/products', authenticateToken, bulkOperationsController.bulkUpdateProducts);

// POST /api/v1/shared/bulk/inventory - Bulk update inventory
router.post('/inventory', authenticateToken, bulkOperationsController.bulkUpdateInventory);

// POST /api/v1/shared/bulk/import/products - Bulk import products
router.post('/import/products', authenticateToken, bulkOperationsController.bulkImportProducts);

// GET /api/v1/shared/bulk/export/:type - Bulk export data
router.get('/export/:type', authenticateToken, cacheMiddleware(appConfig.cache.bulk), bulkOperationsController.bulkExport);

// DELETE /api/v1/shared/bulk/:type - Bulk delete
router.delete('/:type', authenticateToken, bulkOperationsController.bulkDelete);

module.exports = router;
