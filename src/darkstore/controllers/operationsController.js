/**
 * Darkstore Operations Controller
 * SLA Monitor, Missing Item Tracker, Live Picking Monitor
 */
const Order = require('../models/Order');
const OperationalAlert = require('../models/OperationalAlert');
const { ORDER_STATUS } = require('../../constants/pickerEnums');

/**
 * GET /darkstore/operations/sla-monitor
 * Returns orders with SLA info for monitoring (new, processing, ASSIGNED, PICKING)
 */
async function getSlaMonitor(req, res) {
  try {
    const storeId = req.query.storeId || '';
    const riskFilter = req.query.risk || ''; // safe | warning | critical

    const query = {
      status: { $in: ['new', 'processing', ORDER_STATUS.ASSIGNED, ORDER_STATUS.PICKING] },
    };
    if (storeId) query.store_id = storeId;
    if (riskFilter && ['safe', 'warning', 'critical'].includes(riskFilter)) {
      query.sla_status = riskFilter;
    }

    const orders = await Order.find(query)
      .sort({ sla_deadline: 1 })
      .limit(200)
      .select('order_id store_id status sla_deadline sla_status sla_timer assignee pickerAssignment item_count')
      .lean();

    const now = new Date();
    const data = orders.map((o) => {
      const deadline = o.sla_deadline ? new Date(o.sla_deadline) : null;
      let remainingMs = 0;
      let remainingFormatted = '—';
      if (deadline) {
        remainingMs = deadline.getTime() - now.getTime();
        const mins = Math.floor(Math.abs(remainingMs) / 60000);
        const secs = Math.floor((Math.abs(remainingMs) % 60000) / 1000);
        remainingFormatted = remainingMs < 0 ? `-${mins}:${String(secs).padStart(2, '0')}` : `${mins}:${String(secs).padStart(2, '0')}`;
      }
      const pickerName = (o.assignee && o.assignee.name) || (o.pickerAssignment && o.pickerAssignment.pickerName) || '—';
      return {
        orderId: o.order_id,
        storeId: o.store_id,
        status: o.status,
        pickerName,
        slaDeadline: o.sla_deadline,
        slaStatus: o.sla_status || 'safe',
        slaTimer: o.sla_timer,
        remainingMs,
        remainingFormatted,
        itemCount: o.item_count || 0,
      };
    });

    res.status(200).json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message || 'Failed to fetch SLA monitor data' });
  }
}

/**
 * GET /darkstore/operations/missing-items
 * Returns flattened missing item reports from orders (pickingData.missingItems)
 */
async function getMissingItems(req, res) {
  try {
    const storeId = req.query.storeId || '';
    const orderId = req.query.orderId || '';

    const query = { 'pickingData.missingItems.0': { $exists: true } };
    if (storeId) query.store_id = storeId;
    if (orderId) query.order_id = orderId;

    const orders = await Order.find(query)
      .sort({ 'pickingData.endTime': -1 })
      .limit(500)
      .select('order_id store_id pickingData assignee pickerAssignment')
      .lean();

    const items = [];
    for (const o of orders) {
      const missing = (o.pickingData && o.pickingData.missingItems) || [];
      const pickerName = (o.assignee && o.assignee.name) || (o.pickerAssignment && o.pickerAssignment.pickerName) || '—';
      const reportedAt = (o.pickingData && o.pickingData.endTime) || o.updatedAt || o.createdAt;
      for (const m of missing) {
        items.push({
          orderId: o.order_id,
          storeId: o.store_id,
          productName: m.productName || '—',
          orderedQty: m.orderedQty ?? 0,
          scannedQty: m.scannedQty ?? 0,
          reason: m.reason || '',
          pickerName,
          reportedAt,
        });
      }
    }

    res.status(200).json({ success: true, data: items });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message || 'Failed to fetch missing items' });
  }
}

/**
 * GET /darkstore/operations/live-picking
 * Item-level pick progress for orders in PICKING status
 */
async function getLivePickingMonitor(req, res) {
  try {
    const storeId = req.query.storeId || '';

    const query = { status: ORDER_STATUS.PICKING };
    if (storeId) query.store_id = storeId;

    const orders = await Order.find(query)
      .sort({ 'pickingData.startTime': 1 })
      .limit(50)
      .select('order_id store_id items pickingData assignee pickerAssignment item_count')
      .lean();

    const data = [];
    for (const o of orders) {
      const pickerName = (o.assignee && o.assignee.name) || (o.pickerAssignment && o.pickerAssignment.pickerName) || '—';
      const pd = o.pickingData || {};
      const missingMap = {};
      for (const m of pd.missingItems || []) {
        missingMap[(m.productName || '').toLowerCase()] = m;
      }
      const items = (o.items || []).map((it, idx) => {
        const productName = it.productName || 'Item';
        const orderedQty = it.quantity || 1;
        const missing = missingMap[(productName || '').toLowerCase()];
        const scannedQty = missing ? (missing.scannedQty ?? 0) : orderedQty;
        const loc =
          it.locationCode ||
          it.location ||
          (it.zone && it.aisle && it.rack != null && it.shelf != null
            ? `${it.zone}-${it.aisle}-${it.rack}-${it.shelf}`
            : null) ||
          it.variantSize;
        return {
          productName,
          orderedQty,
          scannedQty,
          location: loc || '—',
        };
      });
      data.push({
        orderId: o.order_id,
        storeId: o.store_id,
        pickerName,
        startedAt: pd.startTime,
        items,
        progress: pd.accuracy != null ? pd.accuracy : (o.item_count > 0 ? Math.round((1 - (pd.missingItems || []).length / o.item_count) * 100) : 0),
      });
    }

    res.status(200).json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message || 'Failed to fetch live picking data' });
  }
}

/**
 * GET /darkstore/operations/alerts
 * Returns operational alerts (ORDER_SLA_BREACHED, PICKER_INACTIVE, DEVICE_OFFLINE, MULTIPLE_MISSING_ITEMS)
 */
async function getOperationalAlerts(req, res) {
  try {
    const storeId = req.query.storeId || '';
    const status = req.query.status || 'open';

    const query = {};
    if (storeId) query.storeId = storeId;
    if (status && status !== 'all') query.status = status;

    const alerts = await OperationalAlert.find(query)
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();

    res.status(200).json({ success: true, data: alerts });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message || 'Failed to fetch operational alerts' });
  }
}

module.exports = { getSlaMonitor, getMissingItems, getLivePickingMonitor, getOperationalAlerts };
