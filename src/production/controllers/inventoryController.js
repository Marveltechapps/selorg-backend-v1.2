const Shelf = require('../models/Shelf');
const ShelfSKU = require('../models/ShelfSKU');
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

    const shelves = await Shelf.find(shelfQuery).sort({ aisle: 1, shelf_number: 1 }).lean();

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

    if (limit > 100) limit = 100;
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
        category: item.category,
        stock: item.stock,
        status: item.status,
        trend: item.trend,
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
    const { sku, mode, quantity, reason_code, notes } = req.body || {};
    const storeId = req.query.storeId || req.body.storeId || process.env.DEFAULT_STORE_ID;

    if (!sku || !mode || quantity === undefined) {
      return res.status(400).json({
        success: false,
        error: 'SKU, mode, and quantity are required',
      });
    }

    const item = await InventoryItem.findOne({ sku, store_id: storeId });
    if (!item) {
      return res.status(404).json({
        success: false,
        error: 'Item not found',
      });
    }

    const oldStock = item.stock;
    let newStock = oldStock;

    if (mode === 'add') {
      newStock = oldStock + quantity;
    } else if (mode === 'remove' || mode === 'damage') {
      newStock = Math.max(0, oldStock - quantity);
    }

    item.stock = newStock;
    await item.save();

    const adjustmentId = generateId('ADJ');
    const now = new Date();
    const timeString = now.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });

    const adjustment = await InventoryAdjustment.create({
      id: adjustmentId,
      adjustment_id: adjustmentId,
      time: timeString,
      sku,
      action: mode === 'damage' ? 'damage' : mode,
      quantity: mode === 'remove' || mode === 'damage' ? -quantity : quantity,
      user: req.userId || 'system',
      reason: reason_code || notes || 'Adjustment',
      store_id: storeId,
      mode,
      reason_code,
      notes,
      new_stock: newStock,
    });

    // Create audit log
    await AuditLog.create({
      id: generateId('AUDIT'),
      timestamp: now.toISOString(),
      action_type: 'adjustment',
      action: 'CREATE_ADJUSTMENT',
      user: req.userId || 'system',
      sku,
      details: { mode, quantity, reason: reason_code || notes },
      changes: {
        stock_before: oldStock,
        stock_after: newStock,
      },
      store_id: storeId,
    });

    res.status(200).json({
      success: true,
      adjustment_id: adjustmentId,
      sku,
      new_stock: newStock,
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
    const storeId = req.query.storeId || process.env.DEFAULT_STORE_ID || 'DS-Brooklyn-04';
    const date = req.query.date || new Date().toISOString().split('T')[0];

    // Normalize date to ensure YYYY-MM-DD format
    const normalizedDate = date.split('T')[0];

    // Query with exact match
    const query = { store_id: storeId, date: normalizedDate };

    const metrics = await CycleCountMetrics.findOne(query).lean();
    const heatmap = await CycleCountHeatmap.find(query).lean();
    const varianceReport = await CycleCountVariance.find(query)
      .sort({ difference: -1 })
      .lean();

    // If no data found for the requested date, try to find the most recent data for this store
    let finalMetrics = metrics;
    let finalHeatmap = heatmap;
    let finalVarianceReport = varianceReport;

    if (!metrics || heatmap.length === 0 || varianceReport.length === 0) {
      // Find most recent data for this store
      const recentMetrics = await CycleCountMetrics.findOne({ store_id: storeId })
        .sort({ date: -1 })
        .lean();
      
      if (recentMetrics) {
        const recentDate = recentMetrics.date;
        finalMetrics = recentMetrics;
        finalHeatmap = await CycleCountHeatmap.find({ store_id: storeId, date: recentDate }).lean();
        finalVarianceReport = await CycleCountVariance.find({ store_id: storeId, date: recentDate })
          .sort({ difference: -1 })
          .lean();
      }
    }

    res.status(200).json({
      success: true,
      metrics: finalMetrics || {
        daily_count_progress: { percentage: 0, items_counted: 0, items_total: 0 },
        accuracy_rate: { percentage: 0, target: 99.0 },
        variance_value: { amount: 0, currency: 'INR', items_missing: 0, items_extra: 0 },
      },
      heatmap: {
        zones: finalHeatmap.map((zone) => ({
          zone_id: zone.zone_id,
          variance_level: zone.variance_level,
          accuracy: zone.accuracy,
        })),
      },
      variance_report: finalVarianceReport.map((v) => ({
        sku: v.sku,
        expected: v.expected,
        counted: v.counted,
        difference: v.difference,
      })),
    });
  } catch (error) {
    logger.error('Cycle Count API error:', error);
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
    const storeId = req.query.storeId || process.env.DEFAULT_STORE_ID;
    const date = req.query.date || new Date().toISOString().split('T')[0];
    const format = req.query.format || 'pdf';

    // For now, return metadata. In production, generate actual file
    const fileName = `cycle_count_report_${date}.${format}`;
    const contentTypes = {
      pdf: 'application/pdf',
      csv: 'text/csv',
      excel: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    };

    // Response format matches YAML - no success field, just file metadata
    res.status(200).json({
      content_type: contentTypes[format] || 'application/pdf',
      file_name: fileName,
      file_data: 'base64_encoded_file_data_placeholder',
    });
  } catch (error) {
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
      logger.error('Failed to create audit log for scan:', auditError);
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
    logger.error('Scan item error:', error);
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
const logger = require('../../core/utils/logger');
    
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

module.exports = {
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
};

