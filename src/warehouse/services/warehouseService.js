const GRN = require('../models/GRN');
const Picklist = require('../models/Picklist');
const WarehouseOrder = require('../models/Order');
const InventoryItem = require('../models/InventoryItem');
const StockAlert = require('../models/StockAlert');
const StorageLocation = require('../models/StorageLocation');
const InventoryAdjustment = require('../models/InventoryAdjustment');
const QCInspection = require('../models/QCInspection');
const Staff = require('../models/Staff');
const WarehouseEquipment = require('../models/WarehouseEquipment');
const WarehouseException = require('../models/WarehouseException');
const { mergeWarehouseFilter, warehouseKeyMatch } = require('../constants/warehouseScope');

const ACTIVE_PICKLIST_FILTER = { status: { $nin: ['completed', 'cancelled'] } };

const PENDING_STATUSES = new Set(['queued', 'pending', 'assigned']);
const PICKING_STATUSES = new Set(['picking', 'inprogress', 'in-progress', 'paused']);
const DISPATCHING_STATUSES = new Set([
  'dispatching',
  'packing',
  'ready',
  'ready_to_dispatch',
  'staged',
  'dispatch',
]);

function normalizePicklistStatus(status) {
  const raw = (status && String(status).trim()) || 'pending';
  const s = raw.toLowerCase();
  if (s === 'queued') return 'pending';
  return s;
}

function resolvePicklistItemCount(picklist, order) {
  const n = Number(picklist?.items);
  if (Number.isFinite(n) && n > 0) return n;
  if (Array.isArray(picklist?.items) && picklist.items.length > 0) return picklist.items.length;
  if (Array.isArray(picklist?.lineItems) && picklist.lineItems.length > 0) {
    return picklist.lineItems.reduce(
      (sum, line) => sum + (Number(line?.quantity) || 1),
      0
    );
  }
  if (Array.isArray(order?.items) && order.items.length > 0) return order.items.length;
  return 0;
}

function resolvePicklistDestination(picklist, order) {
  const fromPicklist =
    picklist?.customer ||
    picklist?.customerName ||
    picklist?.customer_name ||
    picklist?.destination ||
    picklist?.dropLocation;
  if (fromPicklist && String(fromPicklist).trim()) return String(fromPicklist).trim();

  if (order) {
    const deliveryLine =
      order.delivery?.address &&
      typeof order.delivery.address === 'object' &&
      (order.delivery.address.line1 || order.delivery.address.city)
        ? [order.delivery.address.line1, order.delivery.address.city]
            .filter(Boolean)
            .join(', ')
        : null;
    const fromOrder =
      order.dropLocation ||
      deliveryLine ||
      order.customerName ||
      order.pickupLocation;
    if (fromOrder && String(fromOrder).trim()) return String(fromOrder).trim();
  }

  const zone = picklist?.zone || picklist?.locationZone;
  if (zone && String(zone).trim()) return `Zone ${String(zone).trim()}`;

  return '';
}

function mapPicklistToFlowEntry(picklist, orderByKey) {
  const orderKey = picklist.orderId || picklist.order_id || picklist.id;
  const order =
    orderByKey.get(orderKey) ||
    orderByKey.get(picklist.orderId) ||
    orderByKey.get(picklist.order_id) ||
    orderByKey.get(picklist.id);

  return {
    id: picklist.id || picklist.orderId || picklist.order_id || String(picklist._id || ''),
    orderId: picklist.orderId || picklist.order_id || picklist.id || String(picklist._id || ''),
    customer: resolvePicklistDestination(picklist, order),
    items: resolvePicklistItemCount(picklist, order),
    priority:
      picklist.priority === 'high' || picklist.priority === 'urgent'
        ? 'urgent'
        : picklist.priority === 'medium'
          ? 'high'
          : 'standard',
    status: normalizePicklistStatus(picklist.status),
    zone: picklist.zone || picklist.locationZone || order?.zone || '',
    updatedAt: picklist.updatedAt,
  };
}

async function loadOrdersForPicklists(warehouseKey, picklists) {
  const keys = new Set();
  for (const p of picklists) {
    for (const k of [p.orderId, p.order_id, p.id]) {
      if (k && String(k).trim()) keys.add(String(k).trim());
    }
  }
  if (keys.size === 0) return new Map();

  const keyList = [...keys];
  const orders = await WarehouseOrder.find(
    mergeWarehouseFilter(
      {
        $or: [
          { id: { $in: keyList } },
          { order_id: { $in: keyList } },
        ],
      },
      warehouseKey
    )
  ).lean();

  const orderByKey = new Map();
  for (const o of orders) {
    if (o.id) orderByKey.set(o.id, o);
    if (o.order_id) orderByKey.set(o.order_id, o);
  }
  return orderByKey;
}

async function countOrderFlowByStatus(warehouseKey) {
  const rows = await Picklist.aggregate([
    { $match: mergeWarehouseFilter(ACTIVE_PICKLIST_FILTER, warehouseKey) },
    {
      $project: {
        statusNorm: {
          $toLower: { $ifNull: ['$status', 'pending'] },
        },
      },
    },
    { $group: { _id: '$statusNorm', count: { $sum: 1 } } },
  ]);

  let pending = 0;
  let picking = 0;
  let dispatching = 0;

  for (const row of rows) {
    const status = normalizePicklistStatus(row._id);
    const count = row.count || 0;
    if (PENDING_STATUSES.has(status)) pending += count;
    else if (PICKING_STATUSES.has(status)) picking += count;
    else if (DISPATCHING_STATUSES.has(status)) dispatching += count;
    else dispatching += count;
  }

  return {
    pending,
    picking,
    dispatching,
    total: pending + picking + dispatching,
  };
}

function deriveOperationalStatus(metrics, openExceptions) {
  const { inboundQueue = 0, outboundQueue = 0, criticalAlerts = 0, capacityUtilization = {} } = metrics;
  const bins = capacityUtilization.bins ?? 0;
  if (criticalAlerts > 0 || openExceptions > 2 || outboundQueue > 50 || inboundQueue > 25) {
    return { status: 'critical', message: 'Immediate attention required' };
  }
  if (outboundQueue > 20 || inboundQueue > 12 || bins >= 90 || openExceptions > 0) {
    return { status: 'warning', message: 'Elevated load — monitor closely' };
  }
  return { status: 'healthy', message: 'Operations running normally' };
}

/**
 * @desc Warehouse Overview Service
 */
const warehouseService = {
  getMetrics: async (warehouseKey) => {
    // Compute several live metrics from DB
    const inboundQueue = await GRN.countDocuments(
      mergeWarehouseFilter({ status: { $in: ['pending', 'in-progress'] } }, warehouseKey)
    );
    const outboundQueue = await Picklist.countDocuments(
      mergeWarehouseFilter(ACTIVE_PICKLIST_FILTER, warehouseKey)
    );
    const criticalAlerts = await StockAlert.countDocuments(
      mergeWarehouseFilter({ priority: 'high' }, warehouseKey)
    );

    // Inventory health: ratio of SKUs at or above minStock
    const totalSKUs = await InventoryItem.countDocuments(warehouseKeyMatch(warehouseKey));
    let inventoryHealth = 0;
    if (totalSKUs > 0) {
      const healthySKUs = await InventoryItem.countDocuments(
        mergeWarehouseFilter({ $expr: { $gte: ['$currentStock', '$minStock'] } }, warehouseKey)
      );
      inventoryHealth = Math.round((healthySKUs / totalSKUs) * 1000) / 10; // one decimal percent
    }

    // Capacity utilization: overall bins and cold storage (by zone name containing 'cold')
    const totalBins = await StorageLocation.countDocuments(warehouseKeyMatch(warehouseKey));
    const occupiedBins = await StorageLocation.countDocuments(
      mergeWarehouseFilter({ status: 'occupied' }, warehouseKey)
    );
    const binsUtil = totalBins > 0 ? Math.round((occupiedBins / totalBins) * 1000) / 10 : 0;

    const coldTotal = await StorageLocation.countDocuments(
      mergeWarehouseFilter({ zone: { $regex: 'cold', $options: 'i' } }, warehouseKey)
    );
    const coldOccupied = await StorageLocation.countDocuments(
      mergeWarehouseFilter(
        { zone: { $regex: 'cold', $options: 'i' }, status: 'occupied' },
        warehouseKey
      )
    );
    const coldUtil = coldTotal > 0 ? Math.round((coldOccupied / coldTotal) * 1000) / 10 : 0;

    // ambient/util for non-cold zones (fallback)
    const stageTotal = await StorageLocation.countDocuments(
      mergeWarehouseFilter({ zone: { $regex: 'stage', $options: 'i' } }, warehouseKey)
    );
    const stageOccupied = await StorageLocation.countDocuments(
      mergeWarehouseFilter(
        { zone: { $regex: 'stage', $options: 'i' }, status: 'occupied' },
        warehouseKey
      )
    );
    const stageUtil = stageTotal > 0 ? Math.round((stageOccupied / stageTotal) * 1000) / 10 : 0;

    const ambientTotal = Math.max(0, totalBins - coldTotal - stageTotal);
    const ambientOccupied = Math.max(0, occupiedBins - coldOccupied - stageOccupied);
    const ambientUtil = ambientTotal > 0 ? Math.round((ambientOccupied / ambientTotal) * 1000) / 10 : 0;

    return {
      inboundQueue,
      outboundQueue,
      inventoryHealth,
      criticalAlerts,
      capacityUtilization: {
        bins: binsUtil,
        coldStorage: coldUtil,
        stage: stageUtil,
        ambient: ambientUtil
      }
    };
  },

  getOrderFlow: async (warehouseKey) => {
    const picklists = await Picklist.find(mergeWarehouseFilter(ACTIVE_PICKLIST_FILTER, warehouseKey))
      .sort({ updatedAt: -1 })
      .limit(20)
      .lean();
    const orderByKey = await loadOrdersForPicklists(warehouseKey, picklists);
    return picklists.map((p) => mapPicklistToFlowEntry(p, orderByKey));
  },

  getDailyReport: async (warehouseKey, date = new Date()) => {
    // Aggregate daily operational metrics from DB
    const start = new Date(date);
    start.setHours(0,0,0,0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);

    const totalGRNsProcessed = await GRN.countDocuments(
      mergeWarehouseFilter({ status: 'completed', updatedAt: { $gte: start, $lt: end } }, warehouseKey)
    );
    const totalOrdersPicked = await Picklist.countDocuments(
      mergeWarehouseFilter({ status: 'completed', updatedAt: { $gte: start, $lt: end } }, warehouseKey)
    );
    const totalItemsAdjusted = await InventoryAdjustment.countDocuments(
      mergeWarehouseFilter({ timestamp: { $gte: start, $lt: end } }, warehouseKey)
    );

    const qcTotal = await QCInspection.countDocuments(
      mergeWarehouseFilter({ date: { $gte: start, $lt: end } }, warehouseKey)
    );
    const qcPassed = qcTotal > 0
      ? await QCInspection.countDocuments(
        mergeWarehouseFilter({ date: { $gte: start, $lt: end }, status: 'passed' }, warehouseKey)
      )
      : 0;
    const qcPassRate = qcTotal > 0 ? `${Math.round((qcPassed / qcTotal) * 1000) / 10}%` : 'N/A';

    const activeStaff = await Staff.countDocuments(
      mergeWarehouseFilter({ status: { $in: ['active','Active'] } }, warehouseKey)
    );

    // Top performers (simple heuristic: staff with most completed picks today)
    const topPerformers = await Picklist.aggregate([
      { $match: mergeWarehouseFilter({ status: 'completed', updatedAt: { $gte: start, $lt: end } }, warehouseKey) },
      { $group: { _id: '$picker', tasks: { $sum: 1 } } },
      { $sort: { tasks: -1 } },
      { $limit: 5 },
      { $project: { name: '$_id', tasks: 1, _id: 0 } }
    ]);

    return {
      date: start.toISOString().split('T')[0],
      stats: {
        totalGRNsProcessed,
        totalOrdersPicked,
        totalItemsAdjusted,
        qcPassRate,
        activeStaff
      },
      topPerformers
    };
  },

  getOperationsView: async (warehouseKey) => {
    const lastUpdate = new Date().toISOString();
    const metrics = await warehouseService.getMetrics(warehouseKey);

    const picklists = await Picklist.find(mergeWarehouseFilter(ACTIVE_PICKLIST_FILTER, warehouseKey))
      .sort({ updatedAt: -1 })
      .limit(20)
      .lean();

    const orderByKey = await loadOrdersForPicklists(warehouseKey, picklists);
    const recentOrders = picklists.map((p) => mapPicklistToFlowEntry(p, orderByKey));

    const orderFlowCounts = await countOrderFlowByStatus(warehouseKey);

    const openExceptions = await WarehouseException.countDocuments(
      mergeWarehouseFilter({ status: { $in: ['open', 'investigating'] } }, warehouseKey)
    );
    const activeStaff = await Staff.countDocuments(
      mergeWarehouseFilter({ status: { $in: ['active', 'Active'] } }, warehouseKey)
    );

    const zonesAgg = await StorageLocation.aggregate([
      { $match: warehouseKeyMatch(warehouseKey) },
      {
        $group: {
          _id: '$zone',
          total: { $sum: 1 },
          occupied: { $sum: { $cond: [{ $eq: ['$status', 'occupied'] }, 1, 0] } },
        },
      },
      {
        $project: {
          id: '$_id',
          name: '$_id',
          utilization: {
            $cond: [{ $gt: ['$total', 0] }, { $multiply: [{ $divide: ['$occupied', '$total'] }, 100] }, 0],
          },
          total: 1,
          occupied: 1,
        },
      },
      { $sort: { utilization: -1 } },
      { $limit: 12 },
    ]);

    const zones = zonesAgg.map((z) => ({
      id: z.id || 'unknown',
      name: z.name || 'unknown',
      utilization: Math.round((z.utilization || 0) * 10) / 10,
      total: z.total || 0,
      occupied: z.occupied || 0,
    }));

    const equipment = await WarehouseEquipment.aggregate([
      { $match: warehouseKeyMatch(warehouseKey) },
      {
        $group: {
          _id: '$type',
          total: { $sum: 1 },
          active: { $sum: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] } },
          maintenance: { $sum: { $cond: [{ $eq: ['$status', 'maintenance'] }, 1, 0] } },
        },
      },
    ]);
    const equipmentStatus = {};
    equipment.forEach((e) => {
      const key = e._id || 'other';
      equipmentStatus[key] = { total: e.total, active: e.active, maintenance: e.maintenance };
    });

    const { status: operationalStatus, message: statusMessage } = deriveOperationalStatus(metrics, openExceptions);

    return {
      lastUpdate,
      operationalStatus,
      statusMessage,
      metrics,
      orderFlow: {
        total: orderFlowCounts.total,
        byStatus: {
          picking: orderFlowCounts.picking,
          pending: orderFlowCounts.pending,
          dispatching: orderFlowCounts.dispatching,
        },
        recent: recentOrders,
      },
      zones,
      equipmentStatus,
      openExceptions,
      activeStaff,
    };
  },

  getAnalyticsSummary: async (warehouseKey) => {
    // 1. Weekly Data (last 7 days)
    const weeklyData = [];
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const now = new Date();
    
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const start = new Date(d);
      start.setHours(0,0,0,0);
      const end = new Date(start);
      end.setDate(end.getDate() + 1);
      
      const inbound = await GRN.countDocuments(
        mergeWarehouseFilter({ status: 'completed', updatedAt: { $gte: start, $lt: end } }, warehouseKey)
      );
      const outbound = await Picklist.countDocuments(
        mergeWarehouseFilter({ status: 'completed', updatedAt: { $gte: start, $lt: end } }, warehouseKey)
      );
      
      weeklyData.push({
        day: days[start.getDay()],
        inbound,
        outbound,
        productivity: 85 + (inbound + outbound) // Heuristic productivity based on activity
      });
    }

    // 2. Storage Data
    const totalLocations = await StorageLocation.countDocuments(warehouseKeyMatch(warehouseKey));
    const occupied = await StorageLocation.countDocuments(
      mergeWarehouseFilter({ status: 'occupied' }, warehouseKey)
    );
    const restricted = await StorageLocation.countDocuments(
      mergeWarehouseFilter({ status: 'restricted' }, warehouseKey)
    );
    const empty = totalLocations - occupied - restricted;

    const storageData = [
      { name: 'Occupied', value: totalLocations > 0 ? Math.round((occupied / totalLocations) * 100) : 0, color: '#0891b2' },
      { name: 'Empty', value: totalLocations > 0 ? Math.round((empty / totalLocations) * 100) : 0, color: '#64748B' },
      { name: 'Restricted', value: totalLocations > 0 ? Math.round((restricted / totalLocations) * 100) : 0, color: '#EF4444' },
    ];

    // 3. Inventory by Category
    const inventoryByCategory = await InventoryItem.aggregate([
      { $match: warehouseKeyMatch(warehouseKey) },
      { $group: { _id: '$category', value: { $sum: '$currentStock' } } },
      { $project: { category: '$_id', value: 1, _id: 0 } },
      { $sort: { value: -1 } },
      { $limit: 5 }
    ]);

    // 4. Key Metrics (calculated from real data where possible)
    const totalStaff = await Staff.countDocuments(warehouseKeyMatch(warehouseKey));
    const activeStaff = await Staff.countDocuments(
      mergeWarehouseFilter({ status: 'Active' }, warehouseKey)
    );
    const attendanceRate = totalStaff > 0 ? Math.round((activeStaff / totalStaff) * 100) : 0;

    const totalCounted = await Picklist.countDocuments(
      mergeWarehouseFilter({ status: 'completed' }, warehouseKey)
    );
    const accuracy = '99.8%'; // Placeholder for complex calc

    const totalSKUs = await InventoryItem.countDocuments(warehouseKeyMatch(warehouseKey));
    const stockouts = await InventoryItem.countDocuments(
      mergeWarehouseFilter({ $expr: { $lte: ['$currentStock', 0] } }, warehouseKey)
    );
    const expiringSoon = 0; // Requires expiry field on InventoryItem if available

    const metrics = {
      inboundTurnaround: '94%',
      outboundOnTime: '92%',
      pickingSpeed: '88',
      accuracy: accuracy,
      shrinkage: '0.15%',
      turnoverRate: '14 days',
      avgUPH: '92',
      errorRate: '2%',
      attendance: `${attendanceRate}%`,
      totalStaff: String(totalStaff),
      activeStaff: String(activeStaff),
      totalSKUs: String(totalSKUs),
      stockouts: String(stockouts),
      expiringSoon: String(expiringSoon)
    };

    return {
      weeklyData,
      storageData,
      inventoryData: inventoryByCategory,
      metrics
    };
  }
};

module.exports = warehouseService;

