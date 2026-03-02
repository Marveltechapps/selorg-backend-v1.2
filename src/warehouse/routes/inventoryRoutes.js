const express = require('express');
const router = express.Router();
const inventoryController = require('../controllers/inventoryController');
const appConfig = require('../../config/app');
const {
  validateCreateAdjustment,
  validateCreateCycleCount,
  validateCreateInternalTransfer,
  validateCreateReorderRequest,
} = require('../../middleware/validator');

// Conditional validation middleware - skip in development mode
const conditionalValidateAdjustment = appConfig.nodeEnv === 'development'
  ? (req, res, next) => next()
  : validateCreateAdjustment;

const conditionalValidateCycleCount = appConfig.nodeEnv === 'development'
  ? (req, res, next) => next()
  : validateCreateCycleCount;

const conditionalValidateInternalTransfer = appConfig.nodeEnv === 'development'
  ? (req, res, next) => next()
  : validateCreateInternalTransfer;

const conditionalValidateReorderRequest = appConfig.nodeEnv === 'development'
  ? (req, res, next) => next()
  : validateCreateReorderRequest;

// Inventory Summary
router.get('/summary', inventoryController.getInventorySummary);

// Inventory Items
router.get('/items', inventoryController.listInventoryItems);
router.get('/items/:id', inventoryController.getInventoryItemById);
router.put('/items/:id', inventoryController.updateInventoryItem);

// Storage Locations
router.get('/locations', inventoryController.listStorageLocations);
router.get('/locations/:id', inventoryController.getStorageLocationById);

// Adjustments
router.get('/adjustments', inventoryController.listAdjustments);
router.post('/adjustments', conditionalValidateAdjustment, inventoryController.createAdjustment);

// Cycle Counts
router.get('/cycle-counts', inventoryController.listCycleCounts);
router.get('/cycle-counts/:id', inventoryController.getCycleCountById);
router.post('/cycle-counts', conditionalValidateCycleCount, inventoryController.createCycleCount);
router.put('/cycle-counts/:id', inventoryController.updateCycleCount);
router.put('/cycle-counts/:id/start', inventoryController.startCycleCount);
router.put('/cycle-counts/:id/complete', inventoryController.completeCycleCount);

// Internal Transfers
router.get('/transfers', inventoryController.listInternalTransfers);
router.get('/transfers/:id', inventoryController.getInternalTransferById);
router.post('/transfers', conditionalValidateInternalTransfer, inventoryController.createInternalTransfer);
router.put('/transfers/:id/status', inventoryController.updateTransferStatus);

// Stock Alerts
router.get('/alerts', inventoryController.listStockAlerts);
router.post('/alerts/generate', inventoryController.generateStockAlerts);

// Reorder Requests
router.post('/reorder', conditionalValidateReorderRequest, inventoryController.createReorderRequest);
router.post('/alerts/:id/reorder', conditionalValidateReorderRequest, inventoryController.createReorderRequest);

// Additional Actions
router.post('/stock/:sku/adjust', conditionalValidateAdjustment, inventoryController.createAdjustment);
router.post('/cycle-counts/:id/start', inventoryController.startCycleCount);
router.post('/cycle-counts/:id/complete', inventoryController.completeCycleCount);
router.post('/transfers/:id/complete', inventoryController.completeCycleCount); // Placeholder for complete
router.get('/export', inventoryController.exportInventory);

module.exports = router;

