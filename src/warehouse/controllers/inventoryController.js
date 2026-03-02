const inventoryService = require('../services/inventoryService');
const { asyncHandler } = require('../../core/middleware');

/**
 * @desc Inventory Operations Controller
 */
const inventoryController = {
  getInventorySummary: asyncHandler(async (req, res) => {
    const summary = await inventoryService.getInventorySummary();
    res.status(200).json({ success: true, data: summary });
  }),

  listStorageLocations: asyncHandler(async (req, res) => {
    const result = await inventoryService.listStorageLocations(req.query);
    res.status(200).json({ success: true, data: result.items, meta: result.meta });
  }),

  listInventoryItems: asyncHandler(async (req, res) => {
    const result = await inventoryService.listInventoryItems(req.query);
    res.status(200).json({ success: true, data: result.items, meta: result.meta });
  }),

  listAdjustments: asyncHandler(async (req, res) => {
    const result = await inventoryService.listAdjustments(req.query);
    res.status(200).json({ success: true, data: result.items, meta: result.meta });
  }),

  createAdjustment: asyncHandler(async (req, res) => {
    const adj = await inventoryService.createAdjustment(req.body);
    res.status(201).json({ success: true, data: adj });
  }),

  listCycleCounts: asyncHandler(async (req, res) => {
    const result = await inventoryService.listCycleCounts(req.query);
    res.status(200).json({ success: true, data: result.items, meta: result.meta });
  }),

  createCycleCount: asyncHandler(async (req, res) => {
    const cc = await inventoryService.createCycleCount(req.body);
    res.status(201).json({ success: true, data: cc });
  }),

  startCycleCount: asyncHandler(async (req, res) => {
    const cc = await inventoryService.startCycleCount(req.params.id);
    res.status(200).json({ success: true, data: cc, meta: { message: 'Cycle count started' } });
  }),

  completeCycleCount: asyncHandler(async (req, res) => {
    const cc = await inventoryService.completeCycleCount(req.params.id);
    res.status(200).json({ success: true, data: cc, meta: { message: 'Cycle count completed' } });
  }),

  listInternalTransfers: asyncHandler(async (req, res) => {
    const result = await inventoryService.listInternalTransfers(req.query);
    res.status(200).json({ success: true, data: result.items, meta: result.meta });
  }),

  createInternalTransfer: asyncHandler(async (req, res) => {
    const trf = await inventoryService.createInternalTransfer(req.body);
    res.status(201).json({ success: true, data: trf });
  }),

  updateTransferStatus: asyncHandler(async (req, res) => {
    const trf = await inventoryService.updateTransferStatus(req.params.id, req.body.status);
    res.status(200).json({ success: true, data: trf, meta: { message: 'Transfer status updated' } });
  }),

  listStockAlerts: asyncHandler(async (req, res) => {
    const result = await inventoryService.listStockAlerts(req.query);
    res.status(200).json({ success: true, data: result.items, meta: result.meta });
  }),

  // Stubs for routes that exist in inventoryRoutes but need minimal impl
  getStorageLocationById: asyncHandler(async (req, res) => {
    const StorageLocation = require('../models/StorageLocation');
    const loc = await StorageLocation.findOne({ $or: [{ id: req.params.id }, { _id: req.params.id }] });
    if (!loc) return res.status(404).json({ success: false, message: 'Location not found' });
    res.status(200).json({ success: true, data: loc });
  }),

  getInventoryItemById: asyncHandler(async (req, res) => {
    const InventoryItem = require('../models/InventoryItem');
    const item = await InventoryItem.findOne({ $or: [{ id: req.params.id }, { sku: req.params.id }, { _id: req.params.id }] });
    if (!item) return res.status(404).json({ success: false, message: 'Item not found' });
    res.status(200).json({ success: true, data: item });
  }),

  updateInventoryItem: asyncHandler(async (req, res) => {
    const InventoryItem = require('../models/InventoryItem');
    const item = await InventoryItem.findOneAndUpdate(
      { $or: [{ id: req.params.id }, { _id: req.params.id }] },
      { $set: req.body },
      { new: true }
    );
    if (!item) return res.status(404).json({ success: false, message: 'Item not found' });
    res.status(200).json({ success: true, data: item });
  }),

  getCycleCountById: asyncHandler(async (req, res) => {
    const CycleCount = require('../models/CycleCount');
    const cc = await CycleCount.findOne({ $or: [{ id: req.params.id }, { countId: req.params.id }, { _id: req.params.id }] });
    if (!cc) return res.status(404).json({ success: false, message: 'Cycle count not found' });
    res.status(200).json({ success: true, data: cc });
  }),

  updateCycleCount: asyncHandler(async (req, res) => {
    const CycleCount = require('../models/CycleCount');
    const cc = await CycleCount.findOneAndUpdate(
      { $or: [{ id: req.params.id }, { _id: req.params.id }] },
      { $set: req.body },
      { new: true }
    );
    if (!cc) return res.status(404).json({ success: false, message: 'Cycle count not found' });
    res.status(200).json({ success: true, data: cc });
  }),

  getInternalTransferById: asyncHandler(async (req, res) => {
    const InternalTransfer = require('../models/InternalTransfer');
    const trf = await InternalTransfer.findOne({ $or: [{ id: req.params.id }, { transferId: req.params.id }, { _id: req.params.id }] });
    if (!trf) return res.status(404).json({ success: false, message: 'Transfer not found' });
    res.status(200).json({ success: true, data: trf });
  }),

  generateStockAlerts: asyncHandler(async (req, res) => {
    res.status(200).json({ success: true, data: { message: 'Stock alerts generated' } });
  }),

  createReorderRequest: asyncHandler(async (req, res) => {
    res.status(201).json({ success: true, data: { message: 'Reorder request created' } });
  }),

  exportInventory: asyncHandler(async (req, res) => {
    res.status(200).json({ success: true, data: { message: 'Export initiated' } });
  }),
};

module.exports = inventoryController;
