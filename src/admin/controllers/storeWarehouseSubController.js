const Zone = require('../../merch/models/Zone');
const Store = require('../../merch/models/Store');
const GRN = require('../../warehouse/models/GRN');
const InventoryItem = require('../../warehouse/models/InventoryItem');
const StorageLocation = require('../../warehouse/models/StorageLocation');
const InternalTransfer = require('../../warehouse/models/InternalTransfer');
const inboundService = require('../../warehouse/services/inboundService');
const { asyncHandler } = require('../../core/middleware');
const ErrorResponse = require('../../core/utils/ErrorResponse');

/**
 * Delivery zones: Zone + Store linkage, shaped for Store & Warehouse UI
 * Returns DeliveryZone[]: { id, name, storeId, storeName, radius, areas, isActive, avgDeliveryTime, orderVolume }
 */
const getDeliveryZones = asyncHandler(async (req, res) => {
  const zones = await Zone.find().populate('cityId', 'name').lean();
  const stores = await Store.find({ type: { $in: ['store', 'dark_store'] } })
    .populate('zoneId', 'name')
    .lean();

  const data = [];
  for (const zone of zones) {
    const zoneStores = stores.filter((s) => s.zoneId && s.zoneId._id?.toString() === zone._id?.toString());
    for (const store of zoneStores) {
      data.push({
        id: `${zone._id}-${store._id}`,
        name: `${zone.name || 'Zone'} — ${store.name}`,
        storeId: store._id.toString(),
        storeName: store.name,
        radius: store.deliveryRadius ?? 5,
        areas: [zone.name],
        isActive: zone.status === 'Active' && (store.status === 'active' || store.serviceStatus === 'Full'),
        avgDeliveryTime: 0,
        orderVolume: 0,
      });
    }
  }
  res.json({ success: true, data });
});

/**
 * Inventories: admin-scoped list of inventory items (from warehouse)
 */
const getInventories = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
  const skip = (page - 1) * limit;
  const total = await InventoryItem.countDocuments({});
  const items = await InventoryItem.find({}).sort({ lastUpdated: -1 }).skip(skip).limit(limit).lean();
  const data = items.map((i) => ({
    id: i._id?.toString() ?? i.id,
    sku: i.sku,
    productName: i.productName,
    category: i.category,
    currentStock: i.currentStock,
    minStock: i.minStock,
    maxStock: i.maxStock,
    location: i.location,
    value: i.value,
    lastUpdated: i.lastUpdated ?? i.updatedAt,
  }));
  res.json({
    success: true,
    data,
    meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
  });
});

const getInventoryItemById = asyncHandler(async (req, res) => {
  const item = await InventoryItem.findOne({ $or: [{ id: req.params.id }, { _id: req.params.id }] }).lean();
  if (!item) throw new ErrorResponse('Inventory item not found', 404);
  res.json({
    success: true,
    data: {
      id: item._id?.toString() ?? item.id,
      sku: item.sku,
      productName: item.productName,
      category: item.category,
      currentStock: item.currentStock,
      minStock: item.minStock,
      maxStock: item.maxStock,
      location: item.location,
      value: item.value,
      lastUpdated: item.lastUpdated ?? item.updatedAt,
    },
  });
});

/**
 * Stock movements: combines internal transfers and adjustments
 */
const getStockMovements = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
  const skip = (page - 1) * limit;

  const [transfers, totalTransfers] = await Promise.all([
    InternalTransfer.find({}).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    InternalTransfer.countDocuments({}),
  ]);
  const data = transfers.map((t) => ({
    id: t._id?.toString(),
    type: 'transfer',
    reference: t.transferId ?? t.id ?? t._id?.toString(),
    fromLocation: t.fromLocation,
    toLocation: t.toLocation,
    sku: t.sku,
    productName: t.productName,
    quantity: t.quantity,
    status: t.status ?? 'pending',
    createdAt: t.timestamp ?? t.createdAt,
  }));

  res.json({
    success: true,
    data,
    meta: { total: totalTransfers, page, limit, totalPages: Math.ceil(totalTransfers / limit) },
  });
});

/**
 * GRNs: admin-scoped proxy to warehouse inbound
 */
const getGRNs = asyncHandler(async (req, res) => {
  const result = await inboundService.listGRNs({
    ...req.query,
    page: parseInt(req.query.page) || 1,
    limit: parseInt(req.query.limit) || 20,
  });
  const data = (result.items || []).map((g) => ({
    id: g.id ?? g._id?.toString(),
    poNumber: g.poNumber,
    vendor: g.vendor,
    status: g.status,
    items: g.items,
    timestamp: g.timestamp ?? g.createdAt,
  }));
  res.json({
    success: true,
    data,
    meta: {
      total: result.total,
      page: result.page,
      limit: result.limit,
      totalPages: result.totalPages,
    },
  });
});

const getGRNById = asyncHandler(async (req, res) => {
  const grn = await inboundService.getGRNById(req.params.id);
  res.json({
    success: true,
    data: {
      id: grn.id ?? grn._id?.toString(),
      poNumber: grn.poNumber,
      vendor: grn.vendor,
      status: grn.status,
      items: grn.items,
      timestamp: grn.timestamp ?? grn.createdAt,
    },
  });
});

/**
 * Putaway: admin-scoped list of putaway tasks (from darkstore PutawayTask model)
 */
const getPutawayTasks = asyncHandler(async (req, res) => {
  let PutawayTask;
  try {
    PutawayTask = require('../../darkstore/models/PutawayTask');
  } catch {
    return res.json({ success: true, data: [], meta: { total: 0, page: 1, limit: 20, totalPages: 0 } });
  }
  const page = parseInt(req.query.page) || 1;
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
  const status = req.query.status;
  const skip = (page - 1) * limit;
  const query = {};
  if (status) query.status = status;

  const [tasks, total] = await Promise.all([
    PutawayTask.find(query).sort({ created_at: -1 }).skip(skip).limit(limit).lean(),
    PutawayTask.countDocuments(query),
  ]);
  const data = tasks.map((t) => ({
    id: t.task_id ?? t._id?.toString(),
    grnId: t.grn_id,
    transferId: t.transfer_id,
    sku: t.sku,
    productName: t.product_name,
    quantity: t.quantity,
    location: t.location,
    actualLocation: t.actual_location,
    status: t.status,
    assignedTo: t.assigned_to ?? t.staff_name,
    storeId: t.store_id,
    createdAt: t.created_at ?? t.createdAt,
  }));
  res.json({
    success: true,
    data,
    meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
  });
});

/**
 * Bins (storage locations): admin-scoped list of storage locations
 */
const getBins = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
  const skip = (page - 1) * limit;
  const total = await StorageLocation.countDocuments({});
  const items = await StorageLocation.find({}).sort({ aisle: 1, rack: 1, shelf: 1 }).skip(skip).limit(limit).lean();
  const data = items.map((s) => ({
    id: s._id?.toString() ?? s.id,
    aisle: s.aisle,
    rack: s.rack,
    shelf: s.shelf,
    status: s.status,
    sku: s.sku,
    quantity: s.quantity,
    zone: s.zone,
  }));
  res.json({
    success: true,
    data,
    meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
  });
});

const getBinById = asyncHandler(async (req, res) => {
  const loc = await StorageLocation.findOne({
    $or: [{ id: req.params.id }, { _id: req.params.id }],
  }).lean();
  if (!loc) throw new ErrorResponse('Storage location not found', 404);
  res.json({
    success: true,
    data: {
      id: loc._id?.toString() ?? loc.id,
      aisle: loc.aisle,
      rack: loc.rack,
      shelf: loc.shelf,
      status: loc.status,
      sku: loc.sku,
      quantity: loc.quantity,
      zone: loc.zone,
    },
  });
});

module.exports = {
  getDeliveryZones,
  getInventories,
  getInventoryItemById,
  getStockMovements,
  getGRNs,
  getGRNById,
  getPutawayTasks,
  getBins,
  getBinById,
};
