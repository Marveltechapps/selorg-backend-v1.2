const express = require('express');
const router = express.Router();
const {
  getShelfView,
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
router.get('/shelf-view', getShelfView);

// GET /api/darkstore/inventory/stock-levels
router.get('/stock-levels', getStockLevels);

// PUT /api/darkstore/inventory/items/:sku (Edit details)
router.put('/items/:sku', updateInventoryItem);

// PUT /api/darkstore/inventory/stock-levels/:sku
router.put('/stock-levels/:sku', updateStockLevel);

// DELETE /api/darkstore/inventory/stock-levels/:sku
router.delete('/stock-levels/:sku', deleteInventoryItem);

// PUT /api/darkstore/inventory/stock-levels/:sku/status
router.put('/stock-levels/:sku/status', changeItemStatus);

// GET /api/darkstore/inventory/adjustments
router.get('/adjustments', getAdjustments);

// POST /api/darkstore/inventory/adjustments
router.post('/adjustments', createAdjustment);

// GET /api/darkstore/inventory/cycle-count
router.get('/cycle-count', getCycleCount);

// GET /api/darkstore/inventory/cycle-count/report
router.get('/cycle-count/report', downloadCycleCountReport);

// POST /api/darkstore/inventory/scan
router.post('/scan', scanItem);

// GET /api/darkstore/inventory/audit-log
router.get('/audit-log', getAuditLog);

// POST /api/darkstore/inventory/restock-task
router.post('/restock-task', createRestockTask);

// POST /api/darkstore/inventory/restock (existing - kept for backward compatibility)
router.post('/restock', createRestock);

// Explicitly reject GET requests to POST-only endpoints
router.get('/restock', (req, res) => {
  res.status(405).json({
    success: false,
    error: 'Method not allowed. Use POST method for this endpoint.',
    allowed_methods: ['POST'],
  });
});

module.exports = router;
