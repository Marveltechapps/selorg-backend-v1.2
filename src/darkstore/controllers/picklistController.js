/**
 * Picklist Controller
 * Handles all picklist-related business logic with real DB operations
 */

const Picklist = require('../models/Picklist');
const PicklistOrder = require('../models/PicklistOrder');
const PicklistItem = require('../models/PicklistItem');
const Picker = require('../models/Picker');
const PackingOrder = require('../models/PackingOrder');
const PackingOrderItem = require('../models/PackingOrderItem');

const DEFAULT_STORE = process.env.DEFAULT_STORE_ID || 'DS-Brooklyn-04';
const ZONES = ['Ambient A', 'Ambient B', 'Chiller', 'Frozen'];

function toFrontendPicklist(doc, pickerDoc) {
  if (!doc) return null;
  const d = typeof doc.toObject === 'function' ? doc.toObject() : doc;
  const picker = pickerDoc
    ? { name: pickerDoc.name || pickerDoc.id, avatar: (pickerDoc.avatar || (pickerDoc.name || '?').slice(0, 2)).toUpperCase() }
    : undefined;
  return {
    id: d.picklist_id,
    zone: d.zone,
    slaTime: d.sla_time || '12:00',
    slaStatus: d.sla_status || 'safe',
    items: d.items_count ?? 0,
    orders: d.orders_count ?? 0,
    status: d.status === 'inprogress' ? 'inprogress' : d.status,
    progress: d.progress,
    picker,
    suggestedPicker: d.suggested_picker,
    priority: d.priority || 'normal',
  };
}

/**
 * Get Picklists
 * GET /api/v1/darkstore/picklists
 */
const getPicklists = async (req, res) => {
  try {
    const storeId = req.query.storeId || DEFAULT_STORE;
    const { status, zone, priority, page = 1, limit = 100 } = req.query;
    const query = { store_id: storeId };
    if (status && status !== 'all') query.status = status;
    if (zone && zone !== 'all') {
      if (zone === 'ambient') query.zone = { $in: ['Ambient A', 'Ambient B'] };
      else if (zone === 'chiller') query.zone = 'Chiller';
      else if (zone === 'frozen') query.zone = 'Frozen';
      else query.zone = zone;
    }
    if (priority && priority !== 'all') query.priority = priority;

    const picklists = await Picklist.find(query)
      .sort({ createdAt: -1 })
      .skip((Number(page) - 1) * Number(limit))
      .limit(Number(limit))
      .lean();

    const pickerIds = [...new Set(picklists.map((p) => p.picker_id).filter(Boolean))];
    const pickers = pickerIds.length
      ? await Picker.find({ id: { $in: pickerIds } }).lean()
      : [];
    const pickerMap = Object.fromEntries(pickers.map((p) => [p.id, p]));

    const data = picklists.map((p) => toFrontendPicklist(p, pickerMap[p.picker_id]));

    res.status(200).json({
      success: true,
      data,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total: await Picklist.countDocuments(query),
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch picklists',
    });
  }
};

/**
 * Create Picklist
 * POST /api/v1/darkstore/picklists
 */
const createPicklist = async (req, res) => {
  try {
    const storeId = req.body.storeId || req.query.storeId || DEFAULT_STORE;
    const { zone, priority = 'normal', type = 'auto', orders } = req.body;

    const count = await Picklist.countDocuments({ store_id: storeId });
    const picklistId = `PL-${1000 + count + 1}`;
    const zoneVal = zone && ZONES.includes(zone) ? zone : ZONES[count % ZONES.length];

    const itemsCount = Array.isArray(orders)
      ? orders.reduce((acc, o) => acc + (o.items?.length || 0), 0)
      : 4 + (count % 6);
    const ordersCount = Array.isArray(orders) ? orders.length : 1;

    const picklist = await Picklist.create({
      picklist_id: picklistId,
      store_id: storeId,
      zone: zoneVal,
      sla_time: '15:00',
      sla_status: 'safe',
      items_count: itemsCount,
      orders_count: ordersCount,
      status: 'pending',
      priority: priority,
      type,
    });

    if (Array.isArray(orders) && orders.length > 0) {
      const orderDocs = orders.map((o, idx) => ({
        order_id: o.orderId || `ORD-${9000 + count * 10 + idx}`,
        picklist_id: picklistId,
        item_count: o.items?.length || 0,
        customer_name: o.customerName,
      }));
      await PicklistOrder.insertMany(orderDocs);
      const allItems = orders.flatMap((o) =>
        (o.items || []).map((it) => ({
          sku: it.sku || `SKU-${Date.now()}`,
          name: it.name || it.sku,
          quantity: it.quantity || 1,
          location: it.location || zoneVal,
          picklist_id: picklistId,
        }))
      );
      if (allItems.length) await PicklistItem.insertMany(allItems);
    }

    const pickerDoc = picklist.picker_id ? await Picker.findOne({ id: picklist.picker_id }).lean() : null;
    res.status(201).json({
      success: true,
      data: toFrontendPicklist(picklist.toObject(), pickerDoc),
      message: 'Picklist created successfully',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to create picklist',
    });
  }
};

/**
 * Get Picklist Details
 * GET /api/v1/darkstore/picklists/:picklistId
 */
const getPicklistDetails = async (req, res) => {
  try {
    const { picklistId } = req.params;
    const picklist = await Picklist.findOne({ picklist_id: picklistId }).lean();
    if (!picklist) {
      return res.status(404).json({ success: false, error: 'Picklist not found' });
    }
    const pickerDoc = picklist.picker_id ? await Picker.findOne({ id: picklist.picker_id }).lean() : null;
    res.status(200).json({
      success: true,
      data: toFrontendPicklist(picklist, pickerDoc),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch picklist details',
    });
  }
};

/**
 * Start Picking
 * POST /api/v1/darkstore/picklists/:picklistId/start
 */
const startPicking = async (req, res) => {
  try {
    const { picklistId } = req.params;
    const { pickerId } = req.body || {};

    const picklist = await Picklist.findOne({ picklist_id: picklistId });
    if (!picklist) return res.status(404).json({ success: false, error: 'Picklist not found' });

    picklist.status = 'inprogress';
    picklist.progress = 0;
    if (pickerId) picklist.picker_id = pickerId;
    await picklist.save();

    const pickerDoc = picklist.picker_id ? await Picker.findOne({ id: picklist.picker_id }).lean() : null;
    res.status(200).json({
      success: true,
      data: toFrontendPicklist(picklist.toObject(), pickerDoc),
      message: 'Picking started successfully',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to start picking',
    });
  }
};

/**
 * Update Progress
 * POST /api/v1/darkstore/picklists/:picklistId/progress
 */
const updateProgress = async (req, res) => {
  try {
    const { picklistId } = req.params;
    const { progress } = req.body || {};
    const p = Math.min(100, Math.max(0, Number(progress) || 0));

    const picklist = await Picklist.findOneAndUpdate(
      { picklist_id: picklistId },
      { $set: { progress: p, status: p >= 100 ? 'completed' : 'inprogress' } },
      { new: true }
    ).lean();
    if (!picklist) return res.status(404).json({ success: false, error: 'Picklist not found' });
    const pickerDoc = picklist.picker_id ? await Picker.findOne({ id: picklist.picker_id }).lean() : null;
    res.status(200).json({
      success: true,
      data: toFrontendPicklist(picklist, pickerDoc),
      message: 'Progress updated successfully',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to update progress',
    });
  }
};

/**
 * Pause Picking
 * POST /api/v1/darkstore/picklists/:picklistId/pause
 */
const pausePicking = async (req, res) => {
  try {
    const { picklistId } = req.params;
    const picklist = await Picklist.findOneAndUpdate(
      { picklist_id: picklistId },
      { $set: { status: 'paused' } },
      { new: true }
    ).lean();
    if (!picklist) return res.status(404).json({ success: false, error: 'Picklist not found' });
    const pickerDoc = picklist.picker_id ? await Picker.findOne({ id: picklist.picker_id }).lean() : null;
    res.status(200).json({
      success: true,
      data: toFrontendPicklist(picklist, pickerDoc),
      message: 'Picking paused successfully',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to pause picking',
    });
  }
};

/**
 * Complete Picking
 * POST /api/v1/darkstore/picklists/:picklistId/complete
 */
const completePicking = async (req, res) => {
  try {
    const { picklistId } = req.params;
    const picklist = await Picklist.findOneAndUpdate(
      { picklist_id: picklistId },
      { $set: { status: 'completed', progress: 100 } },
      { new: true }
    ).lean();
    if (!picklist) return res.status(404).json({ success: false, error: 'Picklist not found' });
    const pickerDoc = picklist.picker_id ? await Picker.findOne({ id: picklist.picker_id }).lean() : null;
    res.status(200).json({
      success: true,
      data: toFrontendPicklist(picklist, pickerDoc),
      message: 'Picking completed successfully',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to complete picking',
    });
  }
};

/**
 * Assign Picker
 * POST /api/v1/darkstore/picklists/:picklistId/assign
 */
const assignPicker = async (req, res) => {
  try {
    const { picklistId } = req.params;
    const { pickerId } = req.body || {};
    if (!pickerId) return res.status(400).json({ success: false, error: 'pickerId is required' });

    const picklist = await Picklist.findOneAndUpdate(
      { picklist_id: picklistId },
      { $set: { picker_id: pickerId } },
      { new: true }
    ).lean();
    if (!picklist) return res.status(404).json({ success: false, error: 'Picklist not found' });
    const pickerDoc = await Picker.findOne({ id: pickerId }).lean();
    res.status(200).json({
      success: true,
      data: toFrontendPicklist(picklist, pickerDoc),
      message: 'Picker assigned successfully',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to assign picker',
    });
  }
};

/**
 * Move to Packing
 * POST /api/v1/darkstore/picklists/:picklistId/move-to-packing
 */
const moveToPacking = async (req, res) => {
  try {
    const { picklistId } = req.params;
    const storeId = req.body?.storeId || req.query.storeId || DEFAULT_STORE;

    const picklist = await Picklist.findOne({ picklist_id: picklistId }).lean();
    if (!picklist) return res.status(404).json({ success: false, error: 'Picklist not found' });

    const picklistOrders = await PicklistOrder.find({ picklist_id: picklistId }).lean();
    const picklistItems = await PicklistItem.find({ picklist_id: picklistId }).lean();
    const pickerName = picklist.picker_id ? (await Picker.findOne({ id: picklist.picker_id }).lean())?.name : null;

    if (picklistOrders.length === 0) {
      const orderId = `ORD-${9000 + Math.floor(Math.random() * 999)}`;
      await PackingOrder.create({
        order_id: orderId,
        customer_name: 'Customer',
        order_type: 'standard',
        sla_time: '15:00',
        sla_status: 'normal',
        picker: pickerName || 'System',
        status: 'pending',
        store_id: storeId,
      });
      const itemsForOrder = picklistItems.slice(0, 6);
      if (itemsForOrder.length === 0) {
        const defaultItems = [
          { sku: 'SKU-001', name: 'Organic Bananas', quantity: 1, weight: '1.2kg' },
          { sku: 'SKU-002', name: 'Sourdough Bread', quantity: 1, weight: '0.4kg' },
          { sku: 'SKU-003', name: 'Whole Milk 1L', quantity: 2, weight: '2.0kg' },
        ];
        await PackingOrderItem.insertMany(
          defaultItems.map((it) => ({ ...it, order_id: orderId, status: 'pending' }))
        );
      } else {
        await PackingOrderItem.insertMany(
          itemsForOrder.map((it) => ({
            sku: it.sku,
            name: it.name,
            quantity: it.quantity,
            weight: '0.5kg',
            order_id: orderId,
            status: 'pending',
          }))
        );
      }
    } else {
      for (const po of picklistOrders) {
        const existing = await PackingOrder.findOne({ order_id: po.order_id });
        if (existing) continue;

        await PackingOrder.create({
          order_id: po.order_id,
          customer_name: po.customer_name || 'Customer',
          order_type: 'standard',
          sla_time: '15:00',
          sla_status: 'normal',
          picker: pickerName || 'System',
          status: 'pending',
          store_id: storeId,
        });
        const itemsForOrder = picklistItems.slice(0, 6);
        const itemsToUse = itemsForOrder.length ? itemsForOrder : [
          { sku: 'SKU-001', name: 'Item 1', quantity: 1, weight: '0.5kg' },
          { sku: 'SKU-002', name: 'Item 2', quantity: 1, weight: '0.5kg' },
        ];
        await PackingOrderItem.insertMany(
          itemsToUse.map((it) => ({
            sku: it.sku,
            name: it.name,
            quantity: it.quantity,
            weight: it.weight || '0.5kg',
            order_id: po.order_id,
            status: 'pending',
          }))
        );
      }
    }

    res.status(200).json({
      success: true,
      message: 'Picklist moved to packing successfully',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to move picklist to packing',
    });
  }
};

module.exports = {
  getPicklists,
  createPicklist,
  getPicklistDetails,
  startPicking,
  updateProgress,
  pausePicking,
  completePicking,
  assignPicker,
  moveToPacking,
};
