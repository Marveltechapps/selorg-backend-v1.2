/**
 * Darkstore Operations Controller
 * SLA Monitor, Missing Item Tracker, Live Picking Monitor
 */
const Order = require('../models/Order');
const OperationalAlert = require('../models/OperationalAlert');
const PickerIssue = require('../../picker/models/issue.model');
const PickerUser = require('../../picker/models/user.model');
const { ORDER_STATUS } = require('../../constants/pickerEnums');

function parseInventoryMismatchDescription(desc) {
  const d = String(desc || '');
  const line = (prefix) => {
    const row = d.split('\n').find((l) => l.startsWith(prefix));
    return row ? row.slice(prefix.length).trim() : '';
  };
  return {
    productName: line('Product:') || '—',
    orderedQty: parseInt(line('Expected qty:'), 10),
    scannedQty: parseInt(line('Actual qty:'), 10),
    reason: line('Reason:') || '',
  };
}

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

    // Picker app "Inventory Mismatch" reports (picker_issues), same shape as Missing Item Tracker
    try {
      const issueQuery = { issueType: 'inventory_mismatch', status: { $ne: 'closed' } };
      const issues = await PickerIssue.find(issueQuery)
        .sort({ reportedAt: -1 })
        .limit(300)
        .lean();
      const pickerIds = [...new Set(issues.map((i) => String(i.pickerId)).filter(Boolean))];
      const pickers = await PickerUser.find({ _id: { $in: pickerIds } })
        .select('name currentLocationId')
        .lean();
      const nameById = Object.fromEntries(pickers.map((p) => [String(p._id), p.name || 'Picker']));
      const storeById = Object.fromEntries(pickers.map((p) => [String(p._id), p.currentLocationId || '']));
      for (const issue of issues) {
        const pid = String(issue.pickerId);
        const parsed = parseInventoryMismatchDescription(issue.description);
        items.push({
          orderId: issue.orderId || '—',
          storeId: storeById[pid] || '',
          productName: parsed.productName,
          orderedQty: Number.isFinite(parsed.orderedQty) ? parsed.orderedQty : 0,
          scannedQty: Number.isFinite(parsed.scannedQty) ? parsed.scannedQty : 0,
          reason: parsed.reason || issue.description?.slice(0, 200) || '',
          pickerName: nameById[pid] || 'Picker',
          reportedAt: issue.reportedAt || issue.createdAt,
        });
      }
    } catch (e) {
      // Non-blocking: order-based missing items still returned
    }

    let out = items;
    if (storeId) {
      out = out.filter((row) => !row.storeId || row.storeId === storeId);
    }
    if (orderId) {
      out = out.filter((row) => String(row.orderId || '') === String(orderId));
    }
    out.sort((a, b) => new Date(b.reportedAt || 0) - new Date(a.reportedAt || 0));

    res.status(200).json({ success: true, data: out });
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

/**
 * GET /darkstore/operations/exception-queue
 * Unified pick exceptions: missing_item, short_pick, wrong_item, sla_breach, cancellation, rto
 */
async function getExceptionQueue(req, res) {
  try {
    const storeId = req.query.storeId || '';
    const type = req.query.type || ''; // missing_item | short_pick | wrong_item | sla_breach | cancellation | rto
    const status = req.query.status || 'open'; // open | resolved
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));

    const exceptions = [];
    const query = storeId ? { store_id: storeId } : {};

    if (!type || type === 'missing_item') {
      const missingQuery = { ...query, 'pickingData.missingItems.0': { $exists: true } };
      const orders = await Order.find(missingQuery)
        .sort({ 'pickingData.endTime': -1 })
        .limit(500)
        .select('order_id store_id status pickingData assignee pickerAssignment')
        .lean();
      for (const o of orders) {
        const missing = (o.pickingData && o.pickingData.missingItems) || [];
        const pickerName = (o.assignee && o.assignee.name) || (o.pickerAssignment && o.pickerAssignment.pickerName) || '—';
        const reportedAt = (o.pickingData && o.pickingData.endTime) || o.updatedAt || o.createdAt;
        for (const m of missing) {
          exceptions.push({
            type: 'missing_item',
            orderId: o.order_id,
            storeId: o.store_id,
            pickerName,
            product: m.productName || '—',
            reason: m.reason || 'Item not found',
            status: 'open',
            createdAt: reportedAt,
          });
        }
      }
    }

    if (!type || type === 'sla_breach') {
      const now = new Date();
      const slaQuery = {
        ...query,
        status: { $in: ['new', 'processing', ORDER_STATUS.ASSIGNED, ORDER_STATUS.PICKING] },
        sla_deadline: { $lt: now },
      };
      const orders = await Order.find(slaQuery)
        .sort({ sla_deadline: 1 })
        .limit(200)
        .select('order_id store_id status sla_deadline assignee pickerAssignment')
        .lean();
      for (const o of orders) {
        const pickerName = (o.assignee && o.assignee.name) || (o.pickerAssignment && o.pickerAssignment.pickerName) || '—';
        exceptions.push({
          type: 'sla_breach',
          orderId: o.order_id,
          storeId: o.store_id,
          pickerName,
          product: '—',
          reason: 'Order past SLA deadline',
          status: 'open',
          createdAt: o.sla_deadline || o.updatedAt,
        });
      }
    }

    if (!type || type === 'cancellation' || type === 'rto') {
      const statusQuery = { ...query };
      if (type === 'cancellation') statusQuery.status = 'cancelled';
      else if (type === 'rto') statusQuery.status = 'rto';
      else statusQuery.status = { $in: ['cancelled', 'rto'] };

      const orders = await Order.find(statusQuery)
        .sort({ updatedAt: -1 })
        .limit(200)
        .select('order_id store_id status updatedAt assignee pickerAssignment')
        .lean();
      for (const o of orders) {
        const pickerName = (o.assignee && o.assignee.name) || (o.pickerAssignment && o.pickerAssignment.pickerName) || '—';
        exceptions.push({
          type: o.status === 'rto' ? 'rto' : 'cancellation',
          orderId: o.order_id,
          storeId: o.store_id,
          pickerName,
          product: '—',
          reason: o.status === 'rto' ? 'Return to origin' : 'Order cancelled',
          status: 'open',
          createdAt: o.updatedAt || o.createdAt,
        });
      }
    }

    exceptions.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    const total = exceptions.length;
    const skip = (page - 1) * limit;
    const data = exceptions.slice(skip, skip + limit);

    res.status(200).json({
      success: true,
      data,
      pagination: { page, limit, total },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message || 'Failed to fetch exception queue' });
  }
}

/**
 * GET /darkstore/operations/pipeline
 * Live fulfillment pipeline counts by stage
 */
async function getPipelineStats(req, res) {
  try {
    const storeId = req.query.storeId || '';
    const query = storeId ? { store_id: storeId } : {};
    const now = new Date();

    const activeStatuses = {
      queued: ['new'],
      assigned: ['processing', ORDER_STATUS.ASSIGNED],
      picking: [ORDER_STATUS.PICKING],
      packing: ['ready', ORDER_STATUS.PICKED, ORDER_STATUS.PACKED],
      ready_dispatch: [ORDER_STATUS.READY_FOR_DISPATCH],
    };

    const stages = {};
    for (const [stage, statuses] of Object.entries(activeStatuses)) {
      const q = { ...query, status: { $in: statuses } };
      stages[stage] = await Order.countDocuments(q);
    }

    const waitingRiderQuery = {
      ...query,
      status: ORDER_STATUS.READY_FOR_DISPATCH,
      $or: [{ bagId: { $exists: true, $ne: '' } }, { rackLocation: { $exists: true, $ne: '' } }],
    };
    stages.waiting_rider = await Order.countDocuments(waitingRiderQuery);

    const slaCritical = await Order.countDocuments({
      ...query,
      status: { $in: ['new', 'processing', ORDER_STATUS.ASSIGNED, ORDER_STATUS.PICKING, ORDER_STATUS.PACKED, ORDER_STATUS.READY_FOR_DISPATCH] },
      sla_status: 'critical',
    });

    const ordersUnder5Min = await Order.countDocuments({
      ...query,
      status: { $in: ['new', 'processing', ORDER_STATUS.ASSIGNED, ORDER_STATUS.PICKING] },
      sla_deadline: { $gte: now, $lte: new Date(now.getTime() + 5 * 60 * 1000) },
    });

    res.status(200).json({
      success: true,
      data: {
        stages,
        slaCritical,
        ordersUnder5Min,
        totalActive: Object.values(stages).reduce((a, b) => a + b, 0),
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message || 'Failed to fetch pipeline stats' });
  }
}

/**
 * GET /darkstore/operations/activity-feed
 * Recent operational events (last N minutes)
 */
async function getActivityFeed(req, res) {
  try {
    const storeId = req.query.storeId || '';
    const minutes = Math.min(60, Math.max(1, parseInt(req.query.minutes, 10) || 5));
    const since = new Date(Date.now() - minutes * 60 * 1000);
    const query = storeId ? { store_id: storeId } : {};

    const items = [];

    const recentOrders = await Order.find({
      ...query,
      updatedAt: { $gte: since },
    })
      .sort({ updatedAt: -1 })
      .limit(30)
      .select('order_id status updatedAt createdAt sla_status')
      .lean();

    for (const o of recentOrders) {
      const isNew = o.createdAt && new Date(o.createdAt) >= since;
      items.push({
        id: `order-${o.order_id}-${o.updatedAt}`,
        type: isNew ? 'order_created' : 'order_updated',
        title: isNew ? `New order ${o.order_id}` : `Order ${o.order_id} updated`,
        description: `Status: ${o.status}${o.sla_status === 'critical' ? ' · SLA critical' : ''}`,
        orderId: o.order_id,
        createdAt: o.updatedAt || o.createdAt,
      });
    }

    const slaBreaches = await Order.find({
      ...query,
      sla_deadline: { $lt: new Date() },
      status: { $in: ['new', 'processing', ORDER_STATUS.ASSIGNED, ORDER_STATUS.PICKING] },
      updatedAt: { $gte: since },
    })
      .sort({ sla_deadline: 1 })
      .limit(10)
      .select('order_id sla_deadline updatedAt')
      .lean();

    for (const o of slaBreaches) {
      items.push({
        id: `sla-${o.order_id}`,
        type: 'sla_breach',
        title: `SLA breach — ${o.order_id}`,
        description: 'Order past deadline',
        orderId: o.order_id,
        createdAt: o.updatedAt || o.sla_deadline,
      });
    }

    const alertQuery = storeId ? { storeId, createdAt: { $gte: since } } : { createdAt: { $gte: since } };
    const alerts = await OperationalAlert.find(alertQuery)
      .sort({ createdAt: -1 })
      .limit(10)
      .lean();

    for (const a of alerts) {
      items.push({
        id: `alert-${a._id}`,
        type: 'ops_alert',
        title: a.title || a.alertType,
        description: a.description || '',
        orderId: a.orderId,
        createdAt: a.createdAt,
      });
    }

    items.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    res.status(200).json({ success: true, data: items.slice(0, 25) });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message || 'Failed to fetch activity feed' });
  }
}

/**
 * GET /darkstore/operations/order-workflow/:orderId
 * Extended workflow info including rider delivery stage
 */
async function getOrderWorkflow(req, res) {
  try {
    const orderId = String(req.params.orderId || '').trim();
    if (!orderId) {
      return res.status(400).json({ success: false, error: 'Order ID required' });
    }

    const order = await Order.findOne({ order_id: orderId })
      .select('order_id status timeline pickerAssignment assignee sla_status sla_timer sla_deadline bagId rackLocation')
      .lean();

    if (!order) {
      return res.status(404).json({ success: false, error: 'Order not found' });
    }

    let riderStatus = null;
    let riderName = null;
    try {
      const RiderOrder = require('../../rider_v2_backend/src/models/Order').Order;
      const riderOrder = await RiderOrder.findOne({ orderNumber: orderId })
        .select('status riderAssignment metadata')
        .lean();
      if (riderOrder) {
        riderStatus = riderOrder.status || null;
        riderName = riderOrder.riderAssignment?.riderName || riderOrder.riderAssignment?.name || null;
      }
    } catch (_) {
      /* rider module optional */
    }

    const timeline = order.timeline || [];
    const pickerName =
      (order.assignee && order.assignee.name) ||
      (order.pickerAssignment && order.pickerAssignment.pickerName) ||
      null;

    res.status(200).json({
      success: true,
      data: {
        orderId: order.order_id,
        status: order.status,
        timeline,
        pickerName,
        riderStatus,
        riderName,
        readyForDispatch: Boolean(order.bagId && order.rackLocation),
        slaStatus: order.sla_status,
        slaTimer: order.sla_timer,
        slaDeadline: order.sla_deadline,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message || 'Failed to fetch order workflow' });
  }
}

/**
 * GET /darkstore/operations/workflow-sla-metrics
 * P50/P95 pick times, breach rate by hour, exception resolution time
 */
async function getWorkflowSlaMetrics(req, res) {
  try {
    const storeId = req.query.storeId || '';
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const baseQuery = storeId ? { store_id: storeId } : {};

    const pickedOrders = await Order.find({
      ...baseQuery,
      'pickingData.startTime': { $exists: true },
      'pickingData.endTime': { $exists: true },
      updatedAt: { $gte: todayStart },
    })
      .select('pickingData')
      .lean();

    const durations = pickedOrders
      .map((o) => {
        const start = new Date(o.pickingData.startTime).getTime();
        const end = new Date(o.pickingData.endTime).getTime();
        return (end - start) / 1000;
      })
      .filter((d) => d > 0 && d < 3600)
      .sort((a, b) => a - b);

    const percentile = (arr, p) => (arr.length ? arr[Math.min(arr.length - 1, Math.floor(arr.length * p))] : 0);

    const todayOrders = await Order.find({
      ...baseQuery,
      createdAt: { $gte: todayStart },
      sla_deadline: { $exists: true },
    })
      .select('createdAt sla_status sla_deadline')
      .lean();

    const breachByHour = Array.from({ length: 24 }, (_, hour) => ({ hour, breaches: 0, total: 0, rate: 0 }));
    const now = new Date();
    for (const o of todayOrders) {
      const h = new Date(o.createdAt).getHours();
      breachByHour[h].total += 1;
      const breached =
        o.sla_status === 'critical' || (o.sla_deadline && new Date(o.sla_deadline) < now);
      if (breached) breachByHour[h].breaches += 1;
    }
    for (const row of breachByHour) {
      row.rate = row.total > 0 ? Math.round((row.breaches / row.total) * 100) : 0;
    }

    const alertQuery = {
      status: 'resolved',
      updatedAt: { $gte: todayStart },
      ...(storeId ? { storeId } : {}),
    };
    const resolvedAlerts = await OperationalAlert.find(alertQuery).select('createdAt updatedAt').lean();
    const resMs = resolvedAlerts
      .map((a) => new Date(a.updatedAt).getTime() - new Date(a.createdAt).getTime())
      .filter((ms) => ms > 0);
    const avgExceptionResolutionMin = resMs.length
      ? Math.round(resMs.reduce((s, m) => s + m, 0) / resMs.length / 60000)
      : 0;

    res.status(200).json({
      success: true,
      data: {
        pickTimeP50Sec: Math.round(percentile(durations, 0.5)),
        pickTimeP95Sec: Math.round(percentile(durations, 0.95)),
        breachRateByHour: breachByHour,
        avgExceptionResolutionMin,
        sampleSize: durations.length,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message || 'Failed to fetch workflow SLA metrics' });
  }
}

/**
 * GET /darkstore/operations/regional-pipeline
 * Multi-store pipeline health comparison
 */
async function getRegionalPipeline(req, res) {
  try {
    const storeIdsParam = String(req.query.storeIds || '').trim();
    const storeIds = storeIdsParam
      ? storeIdsParam.split(',').map((s) => s.trim()).filter(Boolean)
      : await Order.distinct('store_id');

    const now = new Date();
    const stores = [];

    for (const sid of storeIds.slice(0, 30)) {
      if (!sid) continue;
      const query = { store_id: sid };
      const activeStatuses = ['new', 'processing', ORDER_STATUS.ASSIGNED, ORDER_STATUS.PICKING, ORDER_STATUS.PACKED, ORDER_STATUS.READY_FOR_DISPATCH];
      const totalActive = await Order.countDocuments({ ...query, status: { $in: activeStatuses } });
      const slaCritical = await Order.countDocuments({ ...query, status: { $in: activeStatuses }, sla_status: 'critical' });
      const ordersUnder5Min = await Order.countDocuments({
        ...query,
        status: { $in: ['new', 'processing', ORDER_STATUS.ASSIGNED, ORDER_STATUS.PICKING] },
        sla_deadline: { $gte: now, $lte: new Date(now.getTime() + 5 * 60 * 1000) },
      });
      const pickerCount = await PickerUser.countDocuments({ storeId: sid, isActive: { $ne: false } }).catch(() => 0);
      stores.push({
        storeId: sid,
        totalActive,
        slaCritical,
        ordersUnder5Min,
        slaThreatPct: totalActive > 0 ? Math.round((slaCritical / totalActive) * 100) : 0,
        pickerCount,
      });
    }

    stores.sort((a, b) => b.slaThreatPct - a.slaThreatPct);
    res.status(200).json({ success: true, data: stores });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message || 'Failed to fetch regional pipeline' });
  }
}

/**
 * GET /darkstore/operations/escalation-suggestions
 * Auto-escalation rules surfaced in UI
 */
async function getEscalationSuggestions(req, res) {
  try {
    const storeId = req.query.storeId || '';
    const threeMinAgo = new Date(Date.now() - 3 * 60 * 1000);
    const baseQuery = storeId ? { store_id: storeId } : {};

    const unassignedLong = await Order.find({
      ...baseQuery,
      status: { $in: ['new'] },
      createdAt: { $lte: threeMinAgo },
      $or: [
        { assignee: { $exists: false } },
        { assignee: null },
        { 'assignee.name': { $in: [null, '', '-'] } },
        { 'pickerAssignment.pickerId': { $exists: false } },
      ],
    })
      .sort({ createdAt: 1 })
      .limit(15)
      .select('order_id createdAt order_type sla_status sla_timer')
      .lean();

    const expressUnassigned = await Order.find({
      ...baseQuery,
      status: { $in: ['new', 'processing'] },
      order_type: { $in: ['Express', 'Priority', 'Premium'] },
      $or: [
        { 'pickerAssignment.pickerId': { $exists: false } },
        { 'assignee.name': { $in: [null, '', '-'] } },
      ],
    })
      .limit(10)
      .select('order_id order_type sla_status createdAt')
      .lean();

    const suggestions = [];

    for (const o of unassignedLong) {
      const mins = Math.floor((Date.now() - new Date(o.createdAt).getTime()) / 60000);
      suggestions.push({
        id: `reassign-${o.order_id}`,
        tier: 'P1',
        type: 'unassigned_long',
        orderId: o.order_id,
        message: `Order ${o.order_id} unassigned for ${mins}m — suggest reassign`,
        action: 'assign_picker',
        createdAt: o.createdAt,
      });
    }

    for (const o of expressUnassigned) {
      if (suggestions.some((s) => s.orderId === o.order_id)) continue;
      suggestions.push({
        id: `express-${o.order_id}`,
        tier: 'P1',
        type: 'express_unassigned',
        orderId: o.order_id,
        message: `Express order ${o.order_id} still unassigned`,
        action: 'assign_picker',
        createdAt: o.createdAt,
      });
    }

    const slaCritical = await Order.find({
      ...baseQuery,
      sla_status: 'critical',
      status: { $in: ['new', 'processing', ORDER_STATUS.ASSIGNED, ORDER_STATUS.PICKING] },
    })
      .limit(5)
      .select('order_id sla_timer')
      .lean();

    for (const o of slaCritical) {
      suggestions.unshift({
        id: `p0-${o.order_id}`,
        tier: 'P0',
        type: 'sla_imminent',
        orderId: o.order_id,
        message: `SLA critical — ${o.order_id} (${o.sla_timer || 'breach imminent'})`,
        action: 'view_sla',
        createdAt: new Date().toISOString(),
      });
    }

    res.status(200).json({ success: true, data: suggestions.slice(0, 20) });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message || 'Failed to fetch escalation suggestions' });
  }
}

module.exports = {
  getSlaMonitor,
  getMissingItems,
  getLivePickingMonitor,
  getOperationalAlerts,
  getExceptionQueue,
  getPipelineStats,
  getActivityFeed,
  getOrderWorkflow,
  getWorkflowSlaMetrics,
  getRegionalPipeline,
  getEscalationSuggestions,
};
