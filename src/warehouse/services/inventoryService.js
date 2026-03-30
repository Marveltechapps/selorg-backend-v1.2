const mongoose = require('mongoose');
const StorageLocation = require('../models/StorageLocation');
const InventoryItem = require('../models/InventoryItem');
const InventoryAdjustment = require('../models/InventoryAdjustment');
const CycleCount = require('../models/CycleCount');
const InternalTransfer = require('../models/InternalTransfer');
const StockAlert = require('../models/StockAlert');
const ErrorResponse = require('../../core/utils/ErrorResponse');
const { mergeWarehouseFilter, warehouseFieldsForCreate, warehouseKeyMatch } = require('../constants/warehouseScope');

/**
 * @desc Inventory Operations Service
 * Handles storage locations, items, adjustments, cycle counts, transfers, alerts
 */
const inventoryService = {
  listStorageLocations: async (warehouseKey, query = {}) => {
    const { limit = 100 } = query;
    const items = await StorageLocation.find(warehouseKeyMatch(warehouseKey))
      .sort({ aisle: 1, rack: 1, shelf: 1 })
      .limit(Math.min(parseInt(limit) || 100, 500))
      .lean();
    const total = await StorageLocation.countDocuments(warehouseKeyMatch(warehouseKey));
    return { items, total, meta: { count: items.length } };
  },

  listInventoryItems: async (warehouseKey, query = {}) => {
    const { limit = 100 } = query;
    const items = await InventoryItem.find(warehouseKeyMatch(warehouseKey))
      .sort({ category: 1, sku: 1 })
      .limit(Math.min(parseInt(limit) || 100, 500))
      .lean();
    const total = await InventoryItem.countDocuments(warehouseKeyMatch(warehouseKey));
    return { items, total, meta: { count: items.length } };
  },

  listAdjustments: async (warehouseKey, query = {}) => {
    const { limit = 50 } = query;
    const items = await InventoryAdjustment.find(warehouseKeyMatch(warehouseKey))
      .sort({ timestamp: -1 })
      .limit(Math.min(parseInt(limit) || 50, 200))
      .lean();
    const total = await InventoryAdjustment.countDocuments(warehouseKeyMatch(warehouseKey));
    return { items, total, meta: { count: items.length } };
  },

  createAdjustment: async (warehouseKey, data) => {
    const count = await InventoryAdjustment.countDocuments(warehouseKeyMatch(warehouseKey));
    const id = `ADJ-${String(count + 1).padStart(4, '0')}`;
    return await InventoryAdjustment.create({
      id,
      ...warehouseFieldsForCreate(warehouseKey),
      type: data.type || 'Manual Correction',
      sku: data.sku,
      productName: data.productName || data.sku,
      change: data.change,
      reason: data.reason || 'Manual adjustment',
      user: data.user || 'System',
      timestamp: new Date(),
    });
  },

  listCycleCounts: async (warehouseKey, query = {}) => {
    const { limit = 50 } = query;
    const items = await CycleCount.find(warehouseKeyMatch(warehouseKey))
      .sort({ scheduledDate: -1 })
      .limit(Math.min(parseInt(limit) || 50, 200))
      .lean();
    const total = await CycleCount.countDocuments(warehouseKeyMatch(warehouseKey));
    return { items, total, meta: { count: items.length } };
  },

  createCycleCount: async (warehouseKey, data) => {
    const count = await CycleCount.countDocuments(warehouseKeyMatch(warehouseKey));
    const id = `CC-${String(count + 1).padStart(4, '0')}`;
    const countId = id;
    return await CycleCount.create({
      id,
      countId,
      ...warehouseFieldsForCreate(warehouseKey),
      zone: data.zone,
      assignedTo: data.assignedTo,
      scheduledDate: new Date(data.scheduledDate),
      status: 'scheduled',
      itemsTotal: 0,
      itemsCounted: 0,
      discrepancies: 0,
    });
  },

  startCycleCount: async (warehouseKey, id) => {
    const query = mongoose.Types.ObjectId.isValid(id) && id.length === 24
      ? { $or: [{ id }, { _id: new mongoose.Types.ObjectId(id) }] }
      : { id };
    const cc = await CycleCount.findOne(mergeWarehouseFilter(query, warehouseKey));
    if (!cc) throw new ErrorResponse(`Cycle count not found: ${id}`, 404);
    cc.status = 'in-progress';
    await cc.save();
    return cc;
  },

  completeCycleCount: async (warehouseKey, id) => {
    const query = mongoose.Types.ObjectId.isValid(id) && id.length === 24
      ? { $or: [{ id }, { _id: new mongoose.Types.ObjectId(id) }] }
      : { id };
    const cc = await CycleCount.findOne(mergeWarehouseFilter(query, warehouseKey));
    if (!cc) throw new ErrorResponse(`Cycle count not found: ${id}`, 404);
    cc.status = 'completed';
    cc.itemsCounted = cc.itemsTotal || 0;
    await cc.save();
    return cc;
  },

  listInternalTransfers: async (warehouseKey, query = {}) => {
    const { limit = 50 } = query;
    const items = await InternalTransfer.find(warehouseKeyMatch(warehouseKey))
      .sort({ timestamp: -1 })
      .limit(Math.min(parseInt(limit) || 50, 200))
      .lean();
    const total = await InternalTransfer.countDocuments(warehouseKeyMatch(warehouseKey));
    return { items, total, meta: { count: items.length } };
  },

  createInternalTransfer: async (warehouseKey, data) => {
    const count = await InternalTransfer.countDocuments(warehouseKeyMatch(warehouseKey));
    const id = `IT-${String(count + 1).padStart(4, '0')}`;
    const transferId = id;
    const item = await InventoryItem.findOne(
      mergeWarehouseFilter({ sku: data.sku }, warehouseKey)
    ).lean();
    return await InternalTransfer.create({
      id,
      transferId,
      ...warehouseFieldsForCreate(warehouseKey),
      fromLocation: data.fromLocation,
      toLocation: data.toLocation,
      sku: data.sku,
      productName: data.productName || (item && item.productName) || data.sku,
      quantity: data.quantity,
      status: 'pending',
      initiatedBy: data.initiatedBy || 'System',
      timestamp: new Date(),
    });
  },

  updateTransferStatus: async (warehouseKey, id, status) => {
    const query = mongoose.Types.ObjectId.isValid(id) && id.length === 24
      ? { $or: [{ id }, { transferId: id }, { _id: new mongoose.Types.ObjectId(id) }] }
      : { $or: [{ id }, { transferId: id }] };
    const trf = await InternalTransfer.findOne(mergeWarehouseFilter(query, warehouseKey));
    if (!trf) throw new ErrorResponse(`Transfer not found: ${id}`, 404);
    trf.status = status;
    if (status === 'completed') trf.completedAt = new Date();
    await trf.save();
    return trf;
  },

  listStockAlerts: async (warehouseKey, query = {}) => {
    const { limit = 50 } = query;
    const items = await StockAlert.find(warehouseKeyMatch(warehouseKey))
      .sort({ priority: -1, lastUpdated: -1 })
      .limit(Math.min(parseInt(limit) || 50, 200))
      .lean();
    const total = await StockAlert.countDocuments(warehouseKeyMatch(warehouseKey));
    return { items, total, meta: { count: items.length } };
  },

  getInventorySummary: async (warehouseKey) => {
    const totalBins = await StorageLocation.countDocuments(warehouseKeyMatch(warehouseKey));
    const occupiedBins = await StorageLocation.countDocuments(
      mergeWarehouseFilter({ status: 'occupied' }, warehouseKey)
    );
    const totalSKUs = await InventoryItem.countDocuments(warehouseKeyMatch(warehouseKey));
    const stockValue = await InventoryItem.aggregate([
      { $match: warehouseKeyMatch(warehouseKey) },
      { $group: { _id: null, total: { $sum: '$value' } } },
    ]);
    const cycleCountsInProgress = await CycleCount.countDocuments(
      mergeWarehouseFilter({ status: 'in-progress' }, warehouseKey)
    );
    const highPriorityAlerts = await StockAlert.countDocuments(
      mergeWarehouseFilter({ priority: 'high' }, warehouseKey)
    );
    return {
      totalBins,
      occupiedBins,
      totalSKUs,
      stockValue: (stockValue[0] && stockValue[0].total) || 0,
      cycleCountsInProgress,
      highPriorityAlerts,
    };
  },
};

module.exports = inventoryService;
