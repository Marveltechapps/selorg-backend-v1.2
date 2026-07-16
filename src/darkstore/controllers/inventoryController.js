const Shelf = require('../models/Shelf');
const ShelfSKU = require('../models/ShelfSKU');
const StorageLocation = require('../../warehouse/models/StorageLocation');
const { fromStorageLocation } = require('../utils/inventoryLocationUtil');
const ShelfIssue = require('../models/ShelfIssue');
const ShelfActivity = require('../models/ShelfActivity');
const InventoryItem = require('../models/InventoryItem');
const InventoryAdjustment = require('../models/InventoryAdjustment');
const CycleCountMetrics = require('../models/CycleCountMetrics');
const CycleCountHeatmap = require('../models/CycleCountHeatmap');
const CycleCountVariance = require('../models/CycleCountVariance');
const AuditLog = require('../models/AuditLog');
const RestockTask = require('../models/RestockTask');
const { generateId } = require('../../utils/helpers');
const logger = require('../../core/utils/logger');
const cache = require('../../utils/cache');
const multer = require('multer');
const path = require('path');
const inventoryBulkImport = require('../services/inventoryBulkImport.service');
const {
  deriveInventoryStatus,
  resolveInventoryItem,
  syncShelfStockForItem,
} = require('../utils/inventoryStockSync');
const cycleCountReportService = require('../services/cycleCountReport.service');

/** Push darkstore stock into customer store_inventory + catalog so the web app updates immediately. */
async function syncCustomerAvailability(sku, quantity) {
  try {
    const {
      applyOperationalStockBySku,
    } = require('../../customer-backend/services/inventoryAvailabilitySync');
    const result = await applyOperationalStockBySku(sku, quantity, {
      ensureListed: true,
      mirrorCatalogStock: true,
      invalidateCache: true,
    });
    if (!result?.ok) {
      logger.warn('Customer inventory sync skipped', { sku, error: result?.error });
    }
  } catch (err) {
    logger.warn('Customer inventory sync failed', { sku, error: err?.message || err });
  }
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['.csv', '.xlsx', '.xls'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) cb(null, true);
    else cb(new Error('Invalid file type. Only CSV and Excel files are allowed.'));
  },
});

/**
 * Get Live Shelf View
 * GET /api/darkstore/inventory/shelf-view
 */
const getShelfView = async (req, res) => {
  try {
    const storeId = req.query.storeId || process.env.DEFAULT_STORE_ID;
    const zone = req.query.zone || 'Zone 1 (Ambient)';
    const aisle = req.query.aisle || 'all';

    // Get shelf alerts
    const emptyShelves = await Shelf.countDocuments({
      store_id: storeId,
      zone,
      status: 'critical',
      is_critical: true,
    });

    const misplacedShelves = await Shelf.countDocuments({
      store_id: storeId,
      zone,
      is_misplaced: true,
    });

    // Get damaged goods reports count (from adjustments with damage action in last 24h)
    const damagedGoodsReports = await InventoryAdjustment.countDocuments({
      store_id: storeId,
      action: 'damage',
      createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
    });

    // Build query for shelves
    const shelfQuery = { store_id: storeId, zone };
    if (aisle !== 'all') {
      shelfQuery.aisle = aisle;
    }

    const sheetItemCount = await InventoryItem.countDocuments({
      store_id: storeId,
      imported_via_sheet: true,
    });

    if (sheetItemCount > 0) {
      const fromInventory = await inventoryBulkImport.buildShelfViewFromInventory(
        storeId,
        zone,
        req.query.shelf_location
      );
      return res.status(200).json(fromInventory);
    }

    let shelves = await Shelf.find(shelfQuery).sort({ aisle: 1, shelf_number: 1 }).lean();

    if (shelves.length === 0) {
      const fromInventory = await inventoryBulkImport.buildShelfViewFromInventory(
        storeId,
        zone,
        req.query.shelf_location
      );
      return res.status(200).json(fromInventory);
    }

    // Group shelves by aisle
    const aislesData = {};
    for (const shelf of shelves) {
      if (!aislesData[shelf.aisle]) {
        aislesData[shelf.aisle] = { aisle: shelf.aisle, shelves: [] };
      }

      const shelfSKUs = await ShelfSKU.find({ shelf_id: shelf.shelf_id }).lean();

      aislesData[shelf.aisle].shelves.push({
        shelf_number: shelf.shelf_number,
        location_code: shelf.location_code,
        status: shelf.status,
        is_critical: shelf.is_critical,
        is_misplaced: shelf.is_misplaced,
        assigned_skus: shelfSKUs.map((sku) => ({
          sku: sku.sku,
          product_name: sku.product_name,
          stock_count: sku.stock_count,
        })),
      });
    }

    // Get selected shelf details (default: B-02 or first shelf)
    const selectedShelfLocation = req.query.shelf_location || 'B-02';
    const selectedShelf = await Shelf.findOne({
      store_id: storeId,
      location_code: selectedShelfLocation,
    }).lean();

    let selectedShelfData = null;
    if (selectedShelf) {
      const selectedShelfSKUs = await ShelfSKU.find({ shelf_id: selectedShelf.shelf_id }).lean();
      const selectedShelfIssues = await ShelfIssue.find({ shelf_id: selectedShelf.shelf_id }).lean();
      const selectedShelfActivities = await ShelfActivity.find({ shelf_id: selectedShelf.shelf_id })
        .sort({ createdAt: -1 })
        .limit(5)
        .lean();

      selectedShelfData = {
        location_code: selectedShelf.location_code,
        section: selectedShelf.section || '',
        status: selectedShelf.status,
        assigned_skus: selectedShelfSKUs.map((sku) => ({
          sku: sku.sku,
          product_name: sku.product_name,
          stock_count: sku.stock_count,
        })),
        issues: selectedShelfIssues.map((issue) => ({
          type: issue.type,
          message: issue.message,
          severity: issue.severity,
        })),
        recent_activity: selectedShelfActivities.map((activity) => ({
          action: activity.action,
          timestamp: activity.timestamp,
        })),
      };
    }

    // Response format matches YAML - no success field at top level
    res.status(200).json({
      alerts: {
        empty_shelves: emptyShelves,
        misplaced_items: misplacedShelves,
        damaged_goods_reports: damagedGoodsReports,
      },
      zone,
      aisles: Object.values(aislesData),
      selected_shelf: selectedShelfData,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch shelf view',
    });
  }
};

/**
 * Get Stock Levels
 * GET /api/darkstore/inventory/stock-levels
 */
const getStockLevels = async (req, res) => {
  try {
    const storeId = req.query.storeId || process.env.DEFAULT_STORE_ID;
    const search = req.query.search || '';
    const category = req.query.category || 'all';
    const status = req.query.status || 'all';
    const page = parseInt(req.query.page) || 1;
    let limit = parseInt(req.query.limit) || 50;

    const sheetOnly = req.query.sheetOnly === 'true' || req.query.sheetOnly === true;

    if (sheetOnly) {
      if (limit > 500) limit = 500;
    } else if (limit > 100) {
      limit = 100;
    }
    if (limit < 1) limit = 50;

    const skip = (page - 1) * limit;

    const query = { store_id: storeId };

    if (search) {
      query.$or = [
        { sku: { $regex: search, $options: 'i' } },
        { name: { $regex: search, $options: 'i' } },
      ];
    }

    if (category !== 'all') {
      query.category = category;
    }

    if (status !== 'all') {
      query.status = status;
    }

    if (sheetOnly) {
      query.imported_via_sheet = true;
    }

    const items = await InventoryItem.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const totalItems = await InventoryItem.countDocuments(query);
    const totalPages = Math.ceil(totalItems / limit);

    res.status(200).json({
      success: true,
      items: items.map((item) => ({
        id: item.id || item.sku,
        sku: item.sku,
        name: item.name,
        product_name: item.name,
        category: item.category,
        stock: item.stock,
        status: item.status,
        trend: item.trend,
        location: item.location || '',
      })),
      pagination: {
        current_page: page,
        total_pages: totalPages,
        total_items: totalItems,
        items_per_page: limit,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch stock levels',
    });
  }
};

/**
 * Update Stock Level
 * PUT /api/darkstore/inventory/stock-levels/:sku
 */
const updateStockLevel = async (req, res) => {
  try {
    const { sku } = req.params;
    const { stock, reason, notes } = req.body || {};

    if (stock === undefined) {
      return res.status(400).json({
        success: false,
        error: 'Stock value is required',
      });
    }

    const item = await InventoryItem.findOne({ sku });
    if (!item) {
      return res.status(404).json({
        success: false,
        error: 'Item not found',
      });
    }

    const oldStock = item.stock;
    item.stock = stock;
    await item.save();

    // Create audit log
    await AuditLog.create({
      id: generateId('AUDIT'),
      timestamp: new Date().toISOString(),
      action_type: 'update',
      action: 'UPDATE_STOCK',
      user: req.userId || 'system',
      sku,
      details: { reason, notes },
      changes: {
        stock_before: oldStock,
        stock_after: stock,
      },
      store_id: item.store_id,
    });

    await syncCustomerAvailability(sku, stock);

    res.status(200).json({
      success: true,
      sku,
      updated_stock: stock,
      message: 'Stock level updated successfully',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to update stock level',
    });
  }
};

/**
 * Delete Inventory Item
 * DELETE /api/darkstore/inventory/stock-levels/:sku
 */
const deleteInventoryItem = async (req, res) => {
  try {
    const { sku } = req.params;

    const item = await InventoryItem.findOne({ sku });
    if (!item) {
      return res.status(404).json({
        success: false,
        error: 'Item not found',
      });
    }

    await InventoryItem.deleteOne({ sku });

    // Create audit log
    await AuditLog.create({
      id: generateId('AUDIT'),
      timestamp: new Date().toISOString(),
      action_type: 'delete',
      action: 'REMOVE_ITEM',
      user: req.userId || 'system',
      sku,
      store_id: item.store_id,
    });

    res.status(200).json({
      success: true,
      message: 'Item removed from inventory',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to delete item',
    });
  }
};

/**
 * Change Item Status
 * PUT /api/darkstore/inventory/stock-levels/:sku/status
 */
const changeItemStatus = async (req, res) => {
  try {
    const { sku } = req.params;
    const { status } = req.body || {};

    if (!status) {
      return res.status(400).json({
        success: false,
        error: 'Status is required',
      });
    }

    const item = await InventoryItem.findOne({ sku });
    if (!item) {
      return res.status(404).json({
        success: false,
        error: 'Item not found',
      });
    }

    item.status = status;
    await item.save();

    // Create audit log
    await AuditLog.create({
      id: generateId('AUDIT'),
      timestamp: new Date().toISOString(),
      action_type: 'update',
      action: 'CHANGE_STATUS',
      user: req.userId || 'system',
      sku,
      details: { status },
      store_id: item.store_id,
      module: 'inventory'
    });

    res.status(200).json({
      success: true,
      sku,
      status,
      message: 'Status updated successfully',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to update status',
    });
  }
};

/**
 * Update Inventory Item Details
 * PUT /api/darkstore/inventory/items/:sku
 */
const updateInventoryItem = async (req, res) => {
  try {
    const { sku } = req.params;
    const updateData = req.body || {};

    const item = await InventoryItem.findOne({ sku });
    if (!item) {
      return res.status(404).json({
        success: false,
        error: 'Item not found',
      });
    }

    // Capture old values for audit
    const oldValues = {};
    Object.keys(updateData).forEach(key => {
      if (item[key] !== undefined) {
        oldValues[key] = item[key];
      }
    });

    // Update item
    Object.assign(item, updateData);
    await item.save();

    // Create audit log
    await AuditLog.create({
      id: generateId('AUDIT'),
      timestamp: new Date().toISOString(),
      action_type: 'update',
      action: 'EDIT_DETAILS',
      user: req.userId || 'system',
      sku,
      details: {
        fields_updated: Object.keys(updateData),
        old_values: oldValues,
        new_values: updateData
      },
      store_id: item.store_id,
      module: 'inventory'
    });

    res.status(200).json({
      success: true,
      message: 'Item details updated successfully',
      item: {
        sku: item.sku,
        name: item.name,
        category: item.category,
        location: item.location,
        status: item.status
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to update item details',
    });
  }
};

/**
 * Get Adjustment History
 * GET /api/darkstore/inventory/adjustments
 */
const getAdjustments = async (req, res) => {
  try {
    const storeId = req.query.storeId || process.env.DEFAULT_STORE_ID;
    const sku = req.query.sku;
    const action = req.query.action || 'all';
    const startDate = req.query.startDate;
    const endDate = req.query.endDate;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const skip = (page - 1) * limit;

    const query = { store_id: storeId };

    if (sku) {
      query.sku = sku;
    }

    if (action !== 'all') {
      query.action = action;
    }

    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) {
        query.createdAt.$gte = new Date(startDate);
      }
      if (endDate) {
        query.createdAt.$lte = new Date(endDate);
      }
    }

    const adjustments = await InventoryAdjustment.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const totalItems = await InventoryAdjustment.countDocuments(query);
    const totalPages = Math.ceil(totalItems / limit);

    // Get product names for adjustments
    const skus = [...new Set(adjustments.map(adj => adj.sku))];
    const items = await InventoryItem.find({ sku: { $in: skus } }).select('sku name').lean();
    const itemMap = new Map(items.map(item => [item.sku, item.name]));

    res.status(200).json({
      success: true,
      adjustments: adjustments.map((adj) => ({
        id: adj.id || adj.adjustment_id,
        adjustment_id: adj.id || adj.adjustment_id,
        time: adj.time,
        created_at: adj.createdAt || adj.created_at,
        sku: adj.sku,
        product_name: itemMap.get(adj.sku) || 'Unknown Product',
        action: adj.action,
        quantity: adj.quantity,
        reason: adj.reason || adj.reason_code,
        reason_code: adj.reason_code || adj.reason,
        user: adj.user,
      })),
      pagination: {
        current_page: page,
        total_pages: totalPages,
        total_items: totalItems,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch adjustments',
    });
  }
};

/**
 * Create Inventory Adjustment
 * POST /api/darkstore/inventory/adjustments
 */
const createAdjustment = async (req, res) => {
  try {
    const { sku: skuInput, mode, quantity, reason_code, notes } = req.body || {};
    const storeId = req.body.storeId || req.query.storeId || process.env.DEFAULT_STORE_ID;

    if (!skuInput || !mode || quantity === undefined) {
      return res.status(400).json({
        success: false,
        error: 'SKU, mode, and quantity are required',
      });
    }

    const qty = parseInt(String(quantity), 10);
    if (Number.isNaN(qty) || qty <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Quantity must be a positive whole number',
      });
    }

    if (!['add', 'remove', 'damage'].includes(mode)) {
      return res.status(400).json({
        success: false,
        error: 'Mode must be add, remove, or damage',
      });
    }

    const item = await resolveInventoryItem(InventoryItem, storeId, skuInput);
    if (!item) {
      return res.status(404).json({
        success: false,
        error: `No product found for "${String(skuInput).trim()}" in this store`,
      });
    }

    const oldStock = item.stock;
    let newStock = oldStock;

    if (mode === 'add') {
      newStock = oldStock + qty;
    } else {
      if (qty > oldStock) {
        return res.status(400).json({
          success: false,
          error: `Cannot ${mode === 'damage' ? 'mark damaged' : 'remove'} ${qty} units — only ${oldStock} in stock`,
        });
      }
      newStock = oldStock - qty;
    }

    item.stock = newStock;
    item.status = deriveInventoryStatus(newStock);
    await item.save();
    await syncShelfStockForItem(item);

    const adjustmentId = generateId('ADJ');
    const now = new Date();
    const timeString = now.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
    const userName =
      req.user?.name || req.user?.email || req.userId || req.headers['x-user-name'] || 'System';
    const signedQty = mode === 'add' ? qty : -qty;

    await InventoryAdjustment.create({
      id: adjustmentId,
      adjustment_id: adjustmentId,
      time: timeString,
      sku: item.sku,
      action: mode === 'damage' ? 'damage' : mode,
      quantity: signedQty,
      user: userName,
      reason: reason_code || notes || 'Adjustment',
      store_id: storeId,
      mode,
      reason_code,
      notes,
      new_stock: newStock,
    });

    await AuditLog.create({
      id: generateId('AUDIT'),
      timestamp: now.toISOString(),
      action_type: 'adjustment',
      action: 'CREATE_ADJUSTMENT',
      user: userName,
      sku: item.sku,
      details: { mode, quantity: qty, reason: reason_code || notes },
      changes: {
        stock_before: oldStock,
        stock_after: newStock,
      },
      store_id: storeId,
    });

    await syncCustomerAvailability(item.sku, newStock);

    res.status(200).json({
      success: true,
      adjustment_id: adjustmentId,
      sku: item.sku,
      product_name: item.name,
      old_stock: oldStock,
      new_stock: newStock,
      action: mode,
      quantity: qty,
      message: 'Adjustment created successfully',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to create adjustment',
    });
  }
};

/**
 * Get Cycle Count Data
 * GET /api/darkstore/inventory/cycle-count
 */
const getCycleCount = async (req, res) => {
  try {
    const storeId = req.query.storeId || process.env.DEFAULT_STORE_ID || 'DS-Adyar-01';
    const date = req.query.date || new Date().toISOString().split('T')[0];
    const data = await cycleCountReportService.loadCycleCountData(storeId, date);

    res.status(200).json({
      success: true,
      report_date: data.reportDate,
      metrics: data.metrics || {
        daily_count_progress: { percentage: 0, items_counted: 0, items_total: 0 },
        accuracy_rate: { percentage: 0, target: 99.0 },
        variance_value: { amount: 0, currency: 'INR', items_missing: 0, items_extra: 0 },
      },
      heatmap: { zones: data.heatmap || [] },
      variance_report: (data.variance_report || []).map((v) => ({
        sku: v.sku,
        product_name: v.product_name,
        expected: v.expected,
        counted: v.counted,
        difference: v.difference,
      })),
    });
  } catch (error) {
    logger.error('Cycle Count API error', { error: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch cycle count data',
    });
  }
};

/**
 * Download Cycle Count Report
 * GET /api/darkstore/inventory/cycle-count/report
 */
const downloadCycleCountReport = async (req, res) => {
  try {
    const storeId = req.query.storeId || process.env.DEFAULT_STORE_ID || 'DS-Adyar-01';
    const date = req.query.date || new Date().toISOString().split('T')[0];
    const format = String(req.query.format || 'pdf').toLowerCase();

    const data = await cycleCountReportService.loadCycleCountData(storeId, date);
    const fileDate = data.reportDate || date.split('T')[0];

    if (format === 'csv') {
      const csv = cycleCountReportService.buildReportCsv(data);
      const fileName = `cycle_count_report_${storeId}_${fileDate}.csv`;
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
      return res.status(200).send(csv);
    }

    const pdfBuffer = await cycleCountReportService.buildReportPdfBuffer(data);
    const fileName = `cycle_count_report_${storeId}_${fileDate}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    return res.status(200).send(pdfBuffer);
  } catch (error) {
    logger.error('Cycle count report error', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to generate report',
    });
  }
};

/**
 * Scan Item
 * POST /api/darkstore/inventory/scan
 */
const scanItem = async (req, res) => {
  try {
    // Debug logging
    logger.info('Scan item request received:', {
      body: req.body,
      headers: req.headers,
    });

    const { sku, barcode } = req.body || {};

    // Handle both string and non-string inputs, normalize and filter empty values
    let normalizedSku = null;
    let normalizedBarcode = null;

    if (sku !== undefined && sku !== null) {
      const skuStr = String(sku).trim();
      if (skuStr.length > 0) {
        normalizedSku = skuStr;
      }
    }

    if (barcode !== undefined && barcode !== null) {
      const barcodeStr = String(barcode).trim();
      if (barcodeStr.length > 0) {
        normalizedBarcode = barcodeStr;
      }
    }

    // Validate that at least one identifier is provided
    if (!normalizedSku && !normalizedBarcode) {
      return res.status(400).json({
        success: false,
        error: 'SKU or barcode is required',
      });
    }

    // Build query: prefer SKU if both are provided, otherwise use whichever is available
    let query = {};
    if (normalizedSku) {
      query.sku = normalizedSku;
    } else if (normalizedBarcode) {
      query.barcode = normalizedBarcode;
    }

    logger.info('Scan query:', query);

    // Find item by SKU or barcode
    const item = await InventoryItem.findOne(query).lean();

    if (!item) {
      logger.info('Item not found for query:', query);
      return res.status(404).json({
        success: false,
        error: 'Item not found',
      });
    }

    logger.info('Item found:', item.sku);

    // Create audit log for scan
    try {
      await AuditLog.create({
        id: generateId('AUDIT'),
        timestamp: new Date().toISOString(),
        action_type: 'scan',
        action: 'SCAN_ITEM',
        user: req.userId || 'system',
        sku: item.sku,
        store_id: item.store_id,
      });
    } catch (auditError) {
      // Log audit error but don't fail the scan operation
      logger.error('Failed to create audit log for scan', { error: auditError.message, stack: auditError.stack });
    }

    res.status(200).json({
      success: true,
      item: {
        sku: item.sku,
        name: item.name,
        category: item.category,
        current_stock: item.stock,
        location: item.location || '',
        status: item.status,
      },
      message: 'Item found',
    });
  } catch (error) {
    logger.error('Scan item error', { error: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to scan item',
    });
  }
};

/**
 * Get Audit Log
 * GET /api/darkstore/inventory/audit-log
 */
const getAuditLog = async (req, res) => {
  try {
    const storeId = req.query.storeId || process.env.DEFAULT_STORE_ID;
    const action_type = req.query.action_type || req.query.actionType || 'all';
    const action = req.query.action;
    const module_name = req.query.module;
    const user = req.query.user;
    const sku = req.query.sku;
    const startDate = req.query.startDate;
    const endDate = req.query.endDate;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 100;
    const skip = (page - 1) * limit;

    const query = { store_id: storeId };

    if (action_type !== 'all') {
      query.action_type = action_type;
    }

    if (action) {
      query.action = action;
    }

    if (module_name) {
      query.module = module_name;
    }

    if (sku) {
      query.sku = sku;
    }

    if (user) {
      query.user = { $regex: user, $options: 'i' };
    }

    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) {
        query.createdAt.$gte = new Date(startDate);
      }
      if (endDate) {
        query.createdAt.$lte = new Date(endDate);
      }
    }

    const logs = await AuditLog.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const totalItems = await AuditLog.countDocuments(query);
    const totalPages = Math.ceil(totalItems / limit);

    res.status(200).json({
      success: true,
      logs: logs.map((log) => ({
        id: log.id,
        timestamp: log.timestamp,
        action_type: log.action_type,
        action: log.action, // Added action field
        user: log.user,
        sku: log.sku,
        details: log.details,
        changes: log.changes,
      })),
      pagination: {
        current_page: page,
        total_pages: totalPages,
        total_items: totalItems,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch audit log',
    });
  }
};

/**
 * Create Restock Task
 * POST /api/darkstore/inventory/restock-task
 */
const createRestockTask = async (req, res) => {
  try {
    const { shelf_location, sku, reason } = req.body || {};
    const storeId = req.query.storeId || req.body.storeId || process.env.DEFAULT_STORE_ID;

    if (!shelf_location || !sku || !reason) {
      return res.status(400).json({
        success: false,
        error: 'shelf_location, sku, and reason are required',
      });
    }

    const taskId = generateId('RST-TASK');
    await RestockTask.create({
      task_id: taskId,
      shelf_location,
      sku,
      reason,
      store_id: storeId,
      status: 'pending',
    });

    // Create audit log
    await AuditLog.create({
      id: generateId('AUDIT'),
      timestamp: new Date().toISOString(),
      action_type: 'adjustment',
      action: 'RESTOCK_TASK_CREATED',
      user: req.userId || 'system',
      sku,
      details: { shelf_location, reason },
      store_id: storeId,
      module: 'inventory'
    });

    await cache.delByPattern('dashboard:*');
    res.status(200).json({
      success: true,
      task_id: taskId,
      shelf_location,
      sku,
      message: 'Restock task created successfully',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to create restock task',
    });
  }
};

/**
 * Create restock request (existing endpoint - kept for backward compatibility)
 * POST /api/darkstore/inventory/restock
 */
const createRestock = async (req, res) => {
  try {
    const { sku, store_id, quantity, priority } = req.body || {};
    
    if (!sku || !store_id) {
      return res.status(400).json({
        success: false,
        error: 'sku and store_id are required',
      });
    }
    
    const StockAlert = require('../models/StockAlert');
    const InventoryItem = require('../models/InventoryItem');
    const AlertHistory = require('../models/AlertHistory');
    
    // Get current stock level
    const inventoryItem = await InventoryItem.findOne({ sku, store_id });
    const previousStock = inventoryItem ? inventoryItem.stock : 0;
    
    // Update stock alert to mark as restocked
    const restockId = generateId('RST');
    await StockAlert.updateOne(
      { sku, store_id, is_restocked: false },
      {
        $set: {
          is_restocked: true,
          restock_id: restockId,
          updatedAt: new Date(),
        },
      }
    );
    
    // Update inventory item stock if it exists
    const quantityAdded = quantity || 50;
    const updatedStock = previousStock + quantityAdded;
    if (inventoryItem) {
      inventoryItem.stock = updatedStock;
      await inventoryItem.save();
    }
    
    // Save action history
    const alertHistory = new AlertHistory({
      entity_type: 'SKU',
      entity_id: sku,
      alert_type: 'STOCK_OUT',
      action: 'RESTOCK',
      metadata: {
        quantity_added: quantityAdded,
        previous_stock: previousStock,
        updated_stock: updatedStock,
        priority: priority || 'high',
        restock_id: restockId,
      },
      performed_by: 'system',
      store_id: store_id,
    });
    await alertHistory.save();
    
    // Also create audit log
    await AuditLog.create({
      id: generateId('AUDIT'),
      timestamp: new Date().toISOString(),
      action_type: 'adjustment',
      action: 'RESTOCK',
      user: req.userId || 'system',
      sku,
      details: { quantity_added: quantityAdded, priority: priority || 'high' },
      store_id: store_id,
      module: 'inventory'
    });
    
    const estimatedArrival = new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString();
    await cache.delByPattern('dashboard:*');
    
    res.status(200).json({
      success: true,
      restock_id: restockId,
      estimated_arrival: estimatedArrival,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to create restock request',
    });
  }
};

/**
 * Get product location code (zone-aisle-rack-bin) by SKU
 * GET /api/darkstore/inventory/product-location/:sku
 * For HHD/picker pick screen to display location.
 */
const getProductLocation = async (req, res) => {
  try {
    const { sku } = req.params;
    const storeId = req.query.storeId || process.env.DEFAULT_STORE_ID;
    const loc = await StorageLocation.findOne({ sku, status: 'occupied' }).lean();
    if (!loc) {
      return res.status(200).json({
        success: true,
        sku,
        locationCode: null,
        message: 'No location found for this SKU',
      });
    }
    const locationCode = fromStorageLocation(loc);
    res.status(200).json({
      success: true,
      sku,
      locationCode,
      zone: loc.zone,
      aisle: loc.aisle,
      rack: loc.rack,
      bin: loc.shelf,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get product location',
    });
  }
};

/**
 * Bulk import inventory from CSV/Excel sheet
 * POST /api/darkstore/inventory/bulk-import
 */
const bulkImportInventory = async (req, res) => {
  try {
    upload.single('file')(req, res, async (err) => {
      if (err) {
        return res.status(400).json({ success: false, error: err.message || 'File upload failed' });
      }
      if (!req.file) {
        return res.status(400).json({ success: false, error: 'File is required' });
      }

      const storeId = req.body.storeId || process.env.DEFAULT_STORE_ID || 'DS-Adyar-01';
      const zone = req.body.zone || 'Zone 1 (Ambient)';
      const validateOnly = req.body.validateOnly === 'true' || req.body.validateOnly === true;
      const ext = path.extname(req.file.originalname).toLowerCase();

      try {
        const rows = await inventoryBulkImport.parseUploadFile(req.file.buffer, ext);
        if (!rows.length) {
          return res.status(400).json({
            success: false,
            error: 'No data rows found in file. Use the template and include a header row.',
          });
        }

        const result = await inventoryBulkImport.processInventoryRows(rows, {
          storeId,
          zone,
          validateOnly,
          userId: req.user?.id || req.userId || 'SYSTEM',
          userName: req.user?.name || 'System',
        });

        res.status(200).json({
          success: true,
          uploadId: generateId('UPL'),
          ...result,
          message:
            result.failedRows > 0
              ? `Imported ${result.processedRows} rows with ${result.failedRows} errors`
              : validateOnly
                ? `Validated ${result.processedRows} rows`
                : `Successfully imported ${result.processedRows} rows`,
        });
      } catch (parseErr) {
        logger.error('Bulk import parse error', { error: parseErr.message });
        res.status(400).json({
          success: false,
          error: parseErr.message || 'Failed to parse upload file',
        });
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to process bulk import',
    });
  }
};

/**
 * Download inventory import template
 * GET /api/darkstore/inventory/import-template
 */
const downloadInventoryImportTemplate = async (req, res) => {
  try {
    const csvContent = inventoryBulkImport.buildTemplateCsv();
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="inventory-import-template.csv"');
    res.status(200).send(csvContent);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to download template',
    });
  }
};

module.exports = {
  getShelfView,
  getProductLocation,
  bulkImportInventory,
  downloadInventoryImportTemplate,
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
};

