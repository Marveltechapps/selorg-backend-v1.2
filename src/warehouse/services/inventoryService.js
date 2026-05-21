const mongoose = require('mongoose');
const StorageLocation = require('../models/StorageLocation');
const InventoryItem = require('../models/InventoryItem');
const InventoryAdjustment = require('../models/InventoryAdjustment');
const CycleCount = require('../models/CycleCount');
const InternalTransfer = require('../models/InternalTransfer');
const StockAlert = require('../models/StockAlert');
const ReorderRequest = require('../models/ReorderRequest');
const Staff = require('../models/Staff');
const ErrorResponse = require('../../core/utils/ErrorResponse');
const { mergeWarehouseFilter, warehouseFieldsForCreate, warehouseKeyMatch } = require('../constants/warehouseScope');
const { listAdminZonesForWarehouse } = require('./warehouseAdminZoneService');

const ADJUSTMENT_TYPES = [
  'Damage Write-off',
  'Cycle Count Adj.',
  'Expiry Removal',
  'Manual Adjustment',
  'Found Items',
  'Manual Correction',
];

function alertPriorityForItem(item) {
  if (item.currentStock === 0) return 'high';
  if (item.currentStock < item.minStock / 2) return 'high';
  if (item.currentStock < item.minStock) return 'medium';
  return 'low';
}

function alertTypeForItem(item) {
  if (item.currentStock === 0) return 'out-of-stock';
  if (item.currentStock < item.minStock) return 'low-stock';
  if (item.currentStock > item.maxStock) return 'overstock';
  return null;
}

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
    const item = await InventoryItem.findOne(
      mergeWarehouseFilter({ sku: data.sku }, warehouseKey)
    ).lean();
    const count = await InventoryAdjustment.countDocuments(warehouseKeyMatch(warehouseKey));
    const id = `ADJ-${String(count + 1).padStart(4, '0')}`;
    const change = parseInt(data.change, 10);
    const created = await InventoryAdjustment.create({
      id,
      ...warehouseFieldsForCreate(warehouseKey),
      type: data.type || 'Manual Correction',
      sku: data.sku,
      productName: data.productName || (item && item.productName) || data.sku,
      change,
      reason: data.reason || 'Manual adjustment',
      user: data.user || 'System',
      timestamp: new Date(),
    });

    if (item && Number.isFinite(change)) {
      const nextStock = Math.max(0, (item.currentStock || 0) + change);
      await InventoryItem.updateOne(
        { _id: item._id },
        {
          $set: {
            currentStock: nextStock,
            lastUpdated: new Date(),
            value: (item.value && item.currentStock > 0)
              ? Math.round((item.value / item.currentStock) * nextStock)
              : item.value || 0,
          },
        }
      );
      await inventoryService.syncStockAlerts(warehouseKey);
    }

    return created;
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
    const zone = String(data.zone || '').trim();
    const zoneRegex = new RegExp(`^${zone.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i');
    const [locationSkus, directItems] = await Promise.all([
      StorageLocation.find(
        mergeWarehouseFilter({ zone, status: 'occupied', sku: { $ne: null } }, warehouseKey)
      )
        .select('sku')
        .lean(),
      InventoryItem.find(
        mergeWarehouseFilter({ location: zoneRegex }, warehouseKey)
      )
        .select('sku')
        .lean(),
    ]);
    const skuSet = new Set([
      ...locationSkus.map((l) => l.sku).filter(Boolean),
      ...directItems.map((i) => i.sku).filter(Boolean),
    ]);
    return await CycleCount.create({
      id,
      countId,
      ...warehouseFieldsForCreate(warehouseKey),
      zone,
      assignedTo: data.assignedTo,
      scheduledDate: new Date(data.scheduledDate),
      status: 'scheduled',
      itemsTotal: skuSet.size,
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

  syncStockAlerts: async (warehouseKey) => {
    const items = await InventoryItem.find(warehouseKeyMatch(warehouseKey)).lean();
    const activeSkus = new Set();
    let created = 0;
    let updated = 0;
    let cleared = 0;

    for (const item of items) {
      const type = alertTypeForItem(item);
      if (!type) {
        const removed = await StockAlert.deleteOne(
          mergeWarehouseFilter({ sku: item.sku }, warehouseKey)
        );
        if (removed.deletedCount) cleared += 1;
        continue;
      }

      activeSkus.add(item.sku);
      const payload = {
        type,
        sku: item.sku,
        productName: item.productName,
        currentLevel: item.currentStock,
        threshold: item.minStock,
        priority: alertPriorityForItem(item),
        location: item.location,
        lastUpdated: new Date(),
      };

      const existing = await StockAlert.findOne(
        mergeWarehouseFilter({ sku: item.sku }, warehouseKey)
      );
      if (existing) {
        Object.assign(existing, payload);
        await existing.save();
        updated += 1;
      } else {
        const count = await StockAlert.countDocuments(warehouseKeyMatch(warehouseKey));
        await StockAlert.create({
          id: `ALR-${String(count + 1).padStart(4, '0')}`,
          ...warehouseFieldsForCreate(warehouseKey),
          ...payload,
        });
        created += 1;
      }
    }

    const stale = await StockAlert.find(warehouseKeyMatch(warehouseKey)).select('sku').lean();
    for (const alert of stale) {
      if (!activeSkus.has(alert.sku)) {
        await StockAlert.deleteOne(mergeWarehouseFilter({ sku: alert.sku }, warehouseKey));
        cleared += 1;
      }
    }

    return { created, updated, cleared, total: activeSkus.size };
  },

  listStockAlerts: async (warehouseKey, query = {}) => {
    const { limit = 50, sync = 'true' } = query;
    if (String(sync).toLowerCase() !== 'false') {
      await inventoryService.syncStockAlerts(warehouseKey);
    }
    const items = await StockAlert.find(warehouseKeyMatch(warehouseKey))
      .sort({ priority: -1, lastUpdated: -1 })
      .limit(Math.min(parseInt(limit) || 50, 200))
      .lean();
    const total = await StockAlert.countDocuments(warehouseKeyMatch(warehouseKey));
    return { items, total, meta: { count: items.length } };
  },

  createReorderRequest: async (warehouseKey, data, userName = 'System') => {
    const sku = String(data.sku || '').trim();
    const quantity = parseInt(data.quantity, 10);
    if (!sku || !Number.isFinite(quantity) || quantity < 1) {
      throw new ErrorResponse('SKU and a positive quantity are required', 400);
    }

    const item = await InventoryItem.findOne(
      mergeWarehouseFilter({ sku }, warehouseKey)
    ).lean();
    const count = await ReorderRequest.countDocuments(warehouseKeyMatch(warehouseKey));
    const id = `RO-${String(count + 1).padStart(4, '0')}`;
    const reorder = await ReorderRequest.create({
      id,
      ...warehouseFieldsForCreate(warehouseKey),
      sku,
      productName: data.productName || (item && item.productName) || sku,
      quantity,
      priority: data.priority || 'medium',
      notes: data.notes || '',
      alertId: data.alertId || null,
      requestedBy: userName,
      timestamp: new Date(),
      status: 'pending',
    });

    if (data.alertId) {
      await StockAlert.deleteOne(
        mergeWarehouseFilter({ $or: [{ id: data.alertId }, { sku }] }, warehouseKey)
      );
    }

    return reorder;
  },

  getInventoryMeta: async (warehouseKey) => {
    const [adminZones, staff, adjustmentTypes] = await Promise.all([
      listAdminZonesForWarehouse(warehouseKey),
      Staff.find(
        mergeWarehouseFilter({
          $or: [
            { role: /warehouse/i },
            { role: 'Picker' },
            { role: 'Packer' },
            { role: 'Loader' },
            { role: 'Supervisor' },
            { role: 'Forklift Operator' },
            { role: 'QC Inspector' },
            { role: 'Warehouse Manager' },
          ],
          status: { $in: ['Active', 'Break'] },
        }, warehouseKey)
      )
        .sort({ name: 1 })
        .select('id name role zone status')
        .lean(),
      Promise.resolve(ADJUSTMENT_TYPES),
    ]);

    return {
      zones: adminZones,
      staff: staff.map((s) => ({
        id: s.id,
        name: s.name,
        role: s.role,
        zone: s.zone || null,
        status: s.status,
      })),
      adjustmentTypes,
    };
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
