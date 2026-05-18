const express = require('express');
const router = express.Router();
const { requirePermission } = require('../../core/middleware');
const { PERMISSIONS } = require('../../config/permissions');
const {
  getShelfView,
  getProductLocation,
  getStockLevels,
  updateStockLevel,
  deleteInventoryItem,
  changeItemStatus,
  getAdjustments,
  createAdjustment,
  getCycleCount,
  downloadCycleCountReport,
  scanItem,
  getAuditLog,
  createRestockTask,
  createRestock,
  updateInventoryItem,
} = require('../controllers/inventoryController');

// GET /api/darkstore/inventory/shelf-view
router.get('/shelf-view', requirePermission(PERMISSIONS.INVENTORY_STOCK_READ), getShelfView);

// GET /api/darkstore/inventory/product-location/:sku
router.get('/product-location/:sku', requirePermission(PERMISSIONS.INVENTORY_STOCK_READ), getProductLocation);

// GET /api/darkstore/inventory/stock-levels
router.get('/stock-levels', requirePermission(PERMISSIONS.INVENTORY_STOCK_READ), getStockLevels);

// PUT /api/darkstore/inventory/items/:sku (Edit details)
router.put('/items/:sku', requirePermission(PERMISSIONS.INVENTORY_STOCK_WRITE), updateInventoryItem);

// PUT /api/darkstore/inventory/stock-levels/:sku
router.put('/stock-levels/:sku', requirePermission(PERMISSIONS.INVENTORY_STOCK_WRITE), updateStockLevel);

// DELETE /api/darkstore/inventory/stock-levels/:sku
router.delete('/stock-levels/:sku', requirePermission(PERMISSIONS.INVENTORY_STOCK_WRITE), deleteInventoryItem);

// PUT /api/darkstore/inventory/stock-levels/:sku/status
router.put('/stock-levels/:sku/status', requirePermission(PERMISSIONS.INVENTORY_STOCK_WRITE), changeItemStatus);

// GET /api/darkstore/inventory/adjustments
router.get('/adjustments', requirePermission(PERMISSIONS.INVENTORY_STOCK_READ), getAdjustments);

// POST /api/darkstore/inventory/adjustments
router.post(
  '/adjustments',
  requirePermission(PERMISSIONS.INVENTORY_ADJUSTMENT_CREATE),
  createAdjustment
);

// GET /api/darkstore/inventory/cycle-count
router.get('/cycle-count', requirePermission(PERMISSIONS.INVENTORY_STOCK_READ), getCycleCount);

// GET /api/darkstore/inventory/cycle-count/report
router.get('/cycle-count/report', requirePermission(PERMISSIONS.INVENTORY_STOCK_READ), downloadCycleCountReport);

// POST /api/darkstore/inventory/scan
router.post('/scan', requirePermission(PERMISSIONS.INVENTORY_STOCK_WRITE), scanItem);

// GET /api/darkstore/inventory/audit-log
router.get('/audit-log', requirePermission(PERMISSIONS.INVENTORY_STOCK_READ), getAuditLog);

// POST /api/darkstore/inventory/restock-task
router.post('/restock-task', requirePermission(PERMISSIONS.INVENTORY_STOCK_WRITE), createRestockTask);

// POST /api/darkstore/inventory/restock (existing - kept for backward compatibility)
router.post('/restock', requirePermission(PERMISSIONS.INVENTORY_STOCK_WRITE), createRestock);

// Explicitly reject GET requests to POST-only endpoints
router.get('/restock', (req, res) => {
  res.status(405).json({
    success: false,
    error: 'Method not allowed. Use POST method for this endpoint.',
    allowed_methods: ['POST'],
  });
});

module.exports = router;
