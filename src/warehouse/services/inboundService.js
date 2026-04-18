const mongoose = require('mongoose');
const GRN = require('../models/GRN');
const DockSlot = require('../models/DockSlot');
const ErrorResponse = require("../../core/utils/ErrorResponse");
const warehouseNotificationService = require('./warehouseNotificationService');
const { mergeWarehouseFilter, warehouseFieldsForCreate, warehouseKeyMatch } = require('../constants/warehouseScope');

/**
 * @desc Inbound Operations Service
 * Handles business logic for GRNs and Dock management
 */
const inboundService = {
  /**
   * List GRNs with optional filters
   */
  listGRNs: async (warehouseKey, filters = {}) => {
    const {
      status,
      page = 1,
      limit = 50,
    } = filters;

    const query = {};
    if (status) query.status = status;

    const skip = (page - 1) * limit;
    const scopedQuery = mergeWarehouseFilter(query, warehouseKey);
    const total = await GRN.countDocuments(scopedQuery);
    const items = await GRN.find(scopedQuery)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    return {
      items,
      total,
      page: parseInt(page),
      limit: parseInt(limit),
      totalPages: Math.ceil(total / limit),
    };
  },

  /**
   * Create a new GRN
   */
  createGRN: async (warehouseKey, grnData) => {
    const poNumber = String(grnData?.poNumber || '').trim();
    const vendor = String(grnData?.vendor || '').trim();
    const items = Number(grnData?.items ?? 0);

    if (!poNumber) {
      throw new ErrorResponse('poNumber is required to create GRN', 400);
    }
    if (!vendor) {
      throw new ErrorResponse('vendor is required to create GRN', 400);
    }
    if (!Number.isFinite(items) || items < 0) {
      throw new ErrorResponse('items must be a valid non-negative number', 400);
    }

    // Generate a simple ID if not provided (e.g., GRN-123)
    if (!grnData.id) {
      const count = await GRN.countDocuments(warehouseKeyMatch(warehouseKey));
      grnData.id = `GRN-${(count + 1).toString().padStart(3, '0')}`;
    }
    const grn = await GRN.create({
      ...grnData,
      poNumber,
      vendor,
      items,
      ...warehouseFieldsForCreate(warehouseKey)
    });
    warehouseNotificationService.notifyGrnCreated(warehouseKey, grn).catch(() => {});
    return grn;
  },

  /**
   * Get GRN by ID (supports string id e.g. GRN-001 or MongoDB ObjectId)
   */
  getGRNById: async (warehouseKey, id) => {
    const query = mongoose.Types.ObjectId.isValid(id) && String(id).length === 24
      ? { $or: [{ id }, { _id: new mongoose.Types.ObjectId(id) }] }
      : { id };
    const grn = await GRN.findOne(mergeWarehouseFilter(query, warehouseKey));
    if (!grn) throw new ErrorResponse(`GRN not found with id ${id}`, 404);
    return grn;
  },

  /**
   * Start counting for a GRN
   */
  startCounting: async (warehouseKey, id) => {
    const query = mongoose.Types.ObjectId.isValid(id) && String(id).length === 24
      ? { $or: [{ id }, { _id: new mongoose.Types.ObjectId(id) }] }
      : { id };
    const grn = await GRN.findOne(mergeWarehouseFilter(query, warehouseKey));
    if (!grn) throw new ErrorResponse(`GRN not found with id ${id}`, 404);
    
    grn.status = 'in-progress';
    await grn.save();
    return grn;
  },

  /**
   * Complete a GRN
   */
  completeGRN: async (warehouseKey, id) => {
    const query = mongoose.Types.ObjectId.isValid(id) && String(id).length === 24
      ? { $or: [{ id }, { _id: new mongoose.Types.ObjectId(id) }] }
      : { id };
    const grn = await GRN.findOne(mergeWarehouseFilter(query, warehouseKey));
    if (!grn) throw new ErrorResponse(`GRN not found with id ${id}`, 404);
    
    grn.status = 'completed';
    await grn.save();
    warehouseNotificationService.notifyGrnCompleted(warehouseKey, grn).catch(() => {});
    return grn;
  },

  /**
   * Log discrepancy for a GRN
   */
  logDiscrepancy: async (warehouseKey, id, discrepancyData) => {
    const query = mongoose.Types.ObjectId.isValid(id) && String(id).length === 24
      ? { $or: [{ id }, { _id: new mongoose.Types.ObjectId(id) }] }
      : { id };
    const grn = await GRN.findOne(mergeWarehouseFilter(query, warehouseKey));
    if (!grn) throw new ErrorResponse(`GRN not found with id ${id}`, 404);

    grn.status = 'discrepancy';
    if (discrepancyData?.notes) grn.discrepancyNotes = discrepancyData.notes;
    if (discrepancyData?.type) grn.discrepancyType = discrepancyData.type;
    await grn.save();
    warehouseNotificationService.notifyGrnDiscrepancy(warehouseKey, grn).catch(() => {});
    return grn;
  },

  /**
   * List Dock Slots
   */
  listDocks: async (warehouseKey, pagination = {}) => {
    const { page = 1, limit = 50 } = pagination;
    const skip = (page - 1) * limit;
    const total = await DockSlot.countDocuments(warehouseKeyMatch(warehouseKey));
    const items = await DockSlot.find(warehouseKeyMatch(warehouseKey))
      .sort({ name: 1 })
      .skip(skip)
      .limit(limit)
      .lean();
    return {
      items,
      total,
      page: parseInt(page),
      limit: parseInt(limit),
      totalPages: Math.ceil(total / limit),
    };
  },

  /**
   * Update Dock status
   */
  updateDock: async (warehouseKey, id, dockData) => {
    const dock = await DockSlot.findOne(mergeWarehouseFilter({ id }, warehouseKey));
    if (!dock) throw new ErrorResponse(`Dock not found with id ${id}`, 404);
    
    Object.assign(dock, dockData);
    await dock.save();
    return dock;
  }
};

module.exports = inboundService;

