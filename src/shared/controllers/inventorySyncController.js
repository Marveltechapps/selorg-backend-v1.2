const inventorySyncService = require('../services/inventorySyncService');
const { asyncHandler } = require('../../core/middleware');

/**
 * Inventory Sync Controller
 */

/**
 * @route   POST /api/v1/shared/inventory-sync/warehouse-to-store
 * @desc    Sync inventory from warehouse to store
 * @access  Private
 */
const syncWarehouseToStore = asyncHandler(async (req, res) => {
  const { sku, warehouseId, storeId, quantity } = req.body;

  if (!sku || !warehouseId || !storeId) {
    return res.status(400).json({
      success: false,
      error: 'sku, warehouseId, and storeId are required',
    });
  }

  const result = await inventorySyncService.syncWarehouseToStore(
    sku,
    warehouseId,
    storeId,
    quantity
  );

  res.status(200).json({
    success: true,
    data: result,
  });
});

/**
 * @route   POST /api/v1/shared/inventory-sync/store-to-warehouse
 * @desc    Sync inventory from store to warehouse
 * @access  Private
 */
const syncStoreToWarehouse = asyncHandler(async (req, res) => {
  const { sku, storeId, warehouseId } = req.body;

  if (!sku || !storeId || !warehouseId) {
    return res.status(400).json({
      success: false,
      error: 'sku, storeId, and warehouseId are required',
    });
  }

  const result = await inventorySyncService.syncStoreToWarehouse(
    sku,
    storeId,
    warehouseId
  );

  res.status(200).json({
    success: true,
    data: result,
  });
});

/**
 * @route   POST /api/v1/shared/inventory-sync/bulk
 * @desc    Bulk sync inventory
 * @access  Private
 */
const bulkSync = asyncHandler(async (req, res) => {
  const { items } = req.body;

  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({
      success: false,
      error: 'items array is required',
    });
  }

  const results = await inventorySyncService.bulkSync(items);

  res.status(200).json({
    success: true,
    data: results,
  });
});

/**
 * @route   GET /api/v1/shared/inventory-sync/status
 * @desc    Get sync status for a SKU
 * @access  Private
 */
const getSyncStatus = asyncHandler(async (req, res) => {
  const { sku, storeId, warehouseId } = req.query;

  if (!sku || !storeId || !warehouseId) {
    return res.status(400).json({
      success: false,
      error: 'sku, storeId, and warehouseId are required',
    });
  }

  const status = await inventorySyncService.getSyncStatus(
    sku,
    storeId,
    warehouseId
  );

  res.status(200).json({
    success: true,
    data: status,
  });
});

module.exports = {
  syncWarehouseToStore,
  syncStoreToWarehouse,
  bulkSync,
  getSyncStatus,
};
