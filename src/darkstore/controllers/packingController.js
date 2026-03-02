/**
 * Packing Controller
 * Handles all packing-related business logic with real DB operations
 */

const PackingOrder = require('../models/PackingOrder');
const PackingOrderItem = require('../models/PackingOrderItem');

const DEFAULT_STORE = process.env.DEFAULT_STORE_ID || 'DS-Brooklyn-04';

function toQueueItem(doc) {
  if (!doc) return null;
  const d = typeof doc.toObject === 'function' ? doc.toObject() : doc;
  return {
    id: d.order_id,
    picker: d.picker || '—',
    sla: d.sla_time || '15:00',
    items: 0,
    status: d.sla_status || 'normal',
  };
}

function toOrderDetails(orderDoc, items) {
  if (!orderDoc) return null;
  const d = typeof orderDoc.toObject === 'function' ? orderDoc.toObject() : orderDoc;
  const itemList = (items || []).map((it) => {
    const i = typeof it.toObject === 'function' ? it.toObject() : it;
    return {
      sku: i.sku,
      name: i.name,
      qty: i.quantity,
      weight: i.weight || '0.5kg',
      status: i.status || 'pending',
    };
  });
  return {
    id: d.order_id,
    customerName: d.customer_name,
    orderType: d.order_type,
    slaTime: d.sla_time,
    slaStatus: d.sla_status,
    picker: d.picker,
    status: d.status,
    items: itemList,
  };
}

/**
 * Get Pack Queue
 * GET /api/v1/darkstore/packing/queue
 */
const getPackQueue = async (req, res) => {
  try {
    const storeId = req.query.storeId || DEFAULT_STORE;
    const query = { store_id: storeId, status: { $in: ['pending', 'packing'] } };

    const orders = await PackingOrder.find(query).sort({ createdAt: 1 }).lean();

    const itemCounts = await PackingOrderItem.aggregate([
      { $match: { order_id: { $in: orders.map((o) => o.order_id) } } },
      { $group: { _id: '$order_id', count: { $sum: 1 } } },
    ]);
    const countMap = Object.fromEntries(itemCounts.map((c) => [c._id, c.count]));

    const data = orders.map((o) => {
      const q = toQueueItem(o);
      q.items = countMap[o.order_id] ?? 0;
      return q;
    });

    const summary = {
      total: data.length,
      pending: data.filter((o) => o.status === 'pending').length,
      packing: data.filter((o) => o.status === 'packing').length,
    };
    res.status(200).json({
      success: true,
      data: { orders: data, summary },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch pack queue',
    });
  }
};

/**
 * Get Order Details for Packing
 * GET /api/v1/darkstore/packing/orders/:orderId
 */
const getOrderDetails = async (req, res) => {
  try {
    const { orderId } = req.params;

    const order = await PackingOrder.findOne({ order_id: orderId }).lean();
    if (!order) return res.status(404).json({ success: false, error: 'Order not found' });

    const items = await PackingOrderItem.find({ order_id: orderId }).lean();
    const data = toOrderDetails(order, items);

    res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch order details',
    });
  }
};

/**
 * Scan Item
 * POST /api/v1/darkstore/packing/orders/:orderId/scan
 */
const scanItem = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { sku, quantity = 1 } = req.body || {};

    if (!sku) return res.status(400).json({ success: false, error: 'sku is required' });

    const order = await PackingOrder.findOne({ order_id: orderId });
    if (!order) return res.status(404).json({ success: false, error: 'Order not found' });

    const item = await PackingOrderItem.findOne({ order_id: orderId, sku });
    if (!item) return res.status(404).json({ success: false, error: 'Item not found in order' });

    item.status = 'scanned';
    await item.save();

    if (order.status === 'pending') {
      order.status = 'packing';
      await order.save();
    }

    const items = await PackingOrderItem.find({ order_id: orderId }).lean();
    const data = toOrderDetails(order.toObject(), items);

    res.status(200).json({
      success: true,
      data,
      message: 'Item scanned successfully',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to scan item',
    });
  }
};

/**
 * Complete Order Packing
 * POST /api/v1/darkstore/packing/orders/:orderId/complete
 */
const completeOrder = async (req, res) => {
  try {
    const { orderId } = req.params;

    const order = await PackingOrder.findOneAndUpdate(
      { order_id: orderId },
      { $set: { status: 'packed' } },
      { new: true }
    ).lean();
    if (!order) return res.status(404).json({ success: false, error: 'Order not found' });

    res.status(200).json({
      success: true,
      message: 'Order packing completed successfully',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to complete order packing',
    });
  }
};

/**
 * Report Missing Item
 * POST /api/v1/darkstore/packing/orders/:orderId/report-missing
 */
const reportMissingItem = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { sku, quantity = 1, reason } = req.body || {};

    if (!sku) return res.status(400).json({ success: false, error: 'sku is required' });

    const item = await PackingOrderItem.findOneAndUpdate(
      { order_id: orderId, sku },
      { $set: { status: 'missing' } },
      { new: true }
    ).lean();
    if (!item) return res.status(404).json({ success: false, error: 'Item not found in order' });

    res.status(200).json({
      success: true,
      message: 'Missing item reported successfully',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to report missing item',
    });
  }
};

/**
 * Report Damaged Item
 * POST /api/v1/darkstore/packing/orders/:orderId/report-damaged
 */
const reportDamagedItem = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { sku, quantity = 1, reason } = req.body || {};

    if (!sku) return res.status(400).json({ success: false, error: 'sku is required' });

    const item = await PackingOrderItem.findOneAndUpdate(
      { order_id: orderId, sku },
      { $set: { status: 'damaged' } },
      { new: true }
    ).lean();
    if (!item) return res.status(404).json({ success: false, error: 'Item not found in order' });

    res.status(200).json({
      success: true,
      message: 'Damaged item reported successfully',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to report damaged item',
    });
  }
};

module.exports = {
  getPackQueue,
  getOrderDetails,
  scanItem,
  completeOrder,
  reportMissingItem,
  reportDamagedItem,
};
