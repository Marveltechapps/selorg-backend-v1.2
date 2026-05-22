const InventoryItem = require('../models/InventoryItem');
const Job = require('../models/Job');
const Vendor = require('../models/Vendor');
const { v4: uuidv4 } = require('uuid');
const { mergeHubFilter, hubFieldsForCreate } = require('../constants/hubScope');

async function resolveVendorName(vendorId) {
  const vendor = await Vendor.findOne(mergeHubFilter({ _id: vendorId })).select('name').lean();
  return vendor?.name || vendorId;
}

async function getInventorySummary(vendorId) {
  const totalSkus = await InventoryItem.countDocuments(mergeHubFilter({ vendorId }));
  const agg = await InventoryItem.aggregate([
    { $match: mergeHubFilter({ vendorId }) },
    {
      $group: {
        _id: null,
        totalQuantity: { $sum: '$quantity' },
        lowStockCount: {
          $sum: { $cond: [{ $lt: ['$available', 10] }, 1, 0] },
        },
        lastSync: { $max: '$lastUpdated' },
      },
    },
  ]);
  const row = agg[0] || {};
  return {
    vendorId,
    totalSkus,
    totalQuantity: row.totalQuantity || 0,
    lowStockCount: row.lowStockCount || 0,
    lastSync: row.lastSync || null,
  };
}

async function listStock(vendorId, query) {
  const page = Math.max(1, parseInt(query.page || 1, 10));
  const size = Math.max(1, parseInt(query.size || query.limit || 100, 10));
  const filter = { vendorId };
  if (query.sku) filter.sku = query.sku;
  if (query.location) filter.location = query.location;
  const scoped = mergeHubFilter(filter);
  const total = await InventoryItem.countDocuments(scoped);
  const items = await InventoryItem.find(scoped)
    .skip((page - 1) * size)
    .limit(size)
    .sort({ lastUpdated: -1 })
    .lean();
  const vendorName = await resolveVendorName(vendorId);
  return {
    total,
    page,
    size,
    vendorName,
    items: items.map((it) => ({
      ...it,
      id: String(it._id),
      vendor: vendorName,
      physicalQty: it.physicalQty != null ? it.physicalQty : it.quantity,
    })),
  };
}

async function triggerSync(vendorId) {
  const items = await InventoryItem.find(mergeHubFilter({ vendorId }));
  const now = new Date();
  for (const item of items) {
    item.lastUpdated = now;
    if (item.physicalQty == null) item.physicalQty = item.quantity;
    await item.save();
  }
  const job = new Job({
    ...hubFieldsForCreate(),
    jobId: uuidv4(),
    type: 'inventory-sync',
    status: 'succeeded',
    progress: 100,
    result: { vendorId, itemsSynced: items.length },
  });
  await job.save();
  return {
    jobId: job.jobId,
    status: 'SUCCEEDED',
    progress: 100,
    itemsSynced: items.length,
    completedAt: now.toISOString(),
  };
}

async function reconcile(vendorId, requestBody) {
  const differences = [];
  for (const it of requestBody.items || []) {
    const sku = it.sku;
    if (!sku) continue;
    const item = await InventoryItem.findOne(mergeHubFilter({ vendorId, sku }));
    const expectedQty = Number(it.expectedQty ?? item?.quantity ?? 0);
    const reportedQty = Number(it.reportedQty ?? 0);
    const delta = reportedQty - expectedQty;

    if (item) {
      item.quantity = reportedQty;
      item.physicalQty = reportedQty;
      item.available = Math.max(0, reportedQty - (item.reserved || 0));
      item.lastUpdated = new Date();
      if (it.notes) item.remarks = it.notes;
      await item.save();
    }

    differences.push({
      sku,
      expectedQty,
      reportedQty,
      delta,
      suggestion: delta < 0 ? 'increase' : delta > 0 ? 'decrease' : 'hold',
      persisted: Boolean(item),
    });
  }
  return {
    vendorId,
    generatedAt: new Date().toISOString(),
    differences,
    summary: {
      totalChecked: differences.length,
      totalDifferences: differences.filter((d) => d.delta !== 0).length,
    },
  };
}


const EXPIRY_WARN_DAYS = 30;
const AGING_WARN_DAYS = 30;

function severityFromInventoryAging({ daysToExpiry, agingDays, hasExpiry }) {
  if (hasExpiry && daysToExpiry != null && daysToExpiry <= 0) return 'critical';
  if (hasExpiry && daysToExpiry != null && daysToExpiry <= 7) return 'critical';
  if (agingDays >= 60) return 'critical';
  if (hasExpiry && daysToExpiry != null && daysToExpiry <= 14) return 'high';
  if (agingDays >= 45) return 'high';
  if (hasExpiry && daysToExpiry != null && daysToExpiry <= EXPIRY_WARN_DAYS) return 'medium';
  if (agingDays >= AGING_WARN_DAYS) return 'medium';
  return 'low';
}

async function deriveAgingAlertsFromInventory(vendorId) {
  const vendorName = await resolveVendorName(vendorId);
  const items = await InventoryItem.find(mergeHubFilter({ vendorId })).lean();
  const alerts = [];

  for (const item of items) {
    const now = Date.now();
    let daysToExpiry = null;
    if (item.expiryDate) {
      daysToExpiry = Math.ceil((new Date(item.expiryDate).getTime() - now) / 86400000);
    }
    const agingDays = Number(item.agingDays || 0);
    const needsExpiryAlert = item.expiryDate != null && daysToExpiry != null && daysToExpiry <= EXPIRY_WARN_DAYS;
    const needsAgingAlert = agingDays >= AGING_WARN_DAYS;
    if (!needsExpiryAlert && !needsAgingAlert) continue;

    const severity = severityFromInventoryAging({
      daysToExpiry: daysToExpiry ?? 999,
      agingDays,
      hasExpiry: !!item.expiryDate,
    });
    if (severity === 'low') continue;

    const qty = Number(item.quantity || 0);
    const value = Math.round((item.unitPrice || 0) * qty);
    const invId = String(item._id);

    alerts.push({
      _id: `inv-${invId}`,
      id: `inv-${invId}`,
      alertId: `INV-ALT-${item.sku}`,
      inventoryItemId: invId,
      vendorId: String(vendorId),
      vendor: vendorName,
      productName: item.name || item.sku,
      batchId: item.batchId || item.sku,
      type: item.expiryDate ? 'expiry' : 'aging',
      severity,
      status: 'open',
      message:
        item.expiryDate && daysToExpiry != null
          ? daysToExpiry <= 0
            ? 'Batch expired — immediate action required'
            : `Expires in ${daysToExpiry} day${daysToExpiry === 1 ? '' : 's'}`
          : `${agingDays} days in stock — aging review required`,
      expiryDate: item.expiryDate,
      quantity: qty,
      unit: item.unit || 'units',
      value,
      daysToExpiry: daysToExpiry != null ? Math.max(0, daysToExpiry) : 0,
      agingDays,
      source: 'inventory',
      acknowledged: false,
    });
  }

  return alerts;
}

function mergeAgingAlertRows(dbItems, derivedItems) {
  const byKey = new Map();
  const keyOf = (a) => `${a.vendorId || ''}:${a.batchId || ''}:${a.productName || ''}`;
  for (const row of derivedItems) {
    byKey.set(keyOf(row), row);
  }
  for (const row of dbItems) {
    byKey.set(keyOf(row), { ...row, source: row.source || 'alert' });
  }
  const severityRank = { critical: 0, high: 1, medium: 2, low: 3 };
  return Array.from(byKey.values()).sort(
    (a, b) =>
      (severityRank[a.severity] ?? 9) - (severityRank[b.severity] ?? 9) ||
      (b.daysToExpiry || 0) - (a.daysToExpiry || 0)
  );
}


async function listAgingAlerts(vendorId, opts) {
  const Alert = require('../models/Alert');
  const filter = {
    vendorId: String(vendorId),
    acknowledged: { $ne: true },
    $and: [
      {
        $or: [
          { type: { $in: ['aging', 'expiry', 'stock_aging'] } },
          { type: { $exists: false } },
          { type: null },
        ],
      },
      {
        $or: [{ status: 'open' }, { status: { $exists: false } }, { status: null }],
      },
    ],
  };
  if (opts.severity) filter.severity = opts.severity;

  const rows = await Alert.find(mergeHubFilter(filter)).sort({ createdAt: -1 }).lean();
  const vendorName = await resolveVendorName(vendorId);
  const dbItems = rows.map((a) => {
    const daysToExpiry =
      a.expiryDate != null
        ? Math.ceil((new Date(a.expiryDate).getTime() - Date.now()) / 86400000)
        : null;
    return {
      ...a,
      id: String(a._id),
      vendorId: String(vendorId),
      vendor: vendorName,
      productName: a.productName || a.title || a.message,
      message: a.message || a.title,
      daysToExpiry: daysToExpiry != null ? daysToExpiry : 0,
      agingDays: a.agingDays,
      source: 'alert',
    };
  });

  const derived = await deriveAgingAlertsFromInventory(vendorId);
  const items = mergeAgingAlertRows(dbItems, derived);
  return { total: items.length, vendorName, items };
}

async function listHubAgingAlerts() {
  const Vendor = require('../models/Vendor');
  const vendors = await Vendor.find(mergeHubFilter({})).select('_id').lean();
  const allItems = [];
  for (const v of vendors) {
    const vid = String(v._id);
    const chunk = await listAgingAlerts(vid, {});
    if (chunk.items?.length) allItems.push(...chunk.items);
  }
  const severityRank = { critical: 0, high: 1, medium: 2, low: 3 };
  allItems.sort(
    (a, b) =>
      (severityRank[a.severity] ?? 9) - (severityRank[b.severity] ?? 9) ||
      (b.value || 0) - (a.value || 0)
  );
  return { total: allItems.length, vendorName: 'All vendors (hub)', items: allItems };
}

async function listStockouts(vendorId) {
  const vendorName = await resolveVendorName(vendorId);
  const stockouts = await InventoryItem.find(
    mergeHubFilter({
      vendorId,
      $or: [{ available: { $lte: 0 } }, { quantity: { $lte: 0 } }],
    })
  )
    .sort({ lastUpdated: -1 })
    .lean();

  return {
    total: stockouts.length,
    vendorName,
    items: stockouts.map((item) => {
      const daysOut = item.lastUpdated
        ? Math.floor((Date.now() - new Date(item.lastUpdated).getTime()) / 86400000)
        : 0;
      return {
        id: item._id.toString(),
        sku: item.sku,
        product: item.name || item.sku,
        vendor: vendorName,
        warehouse: item.location || 'Chennai Hub',
        daysOutOfStock: daysOut,
        daysOut,
        lastStockDate: item.lastUpdated,
        lastUpdated: item.lastUpdated,
        priority: (item.available || 0) === 0 ? 'Critical' : 'High',
        severity: (item.available || 0) === 0 ? 'Critical' : 'High',
        affectedStores: 1,
        impact: Math.round((item.unitPrice || 0) * (item.quantity || 0)),
        estimatedImpact: Math.round((item.unitPrice || 0) * (item.quantity || 0)),
      };
    }),
  };
}

async function listAgingInventory(vendorId, query) {
  const daysThreshold = parseInt(query.daysThreshold || 30, 10);
  const vendorName = await resolveVendorName(vendorId);
  const agingItems = await InventoryItem.find(
    mergeHubFilter({
      vendorId,
      agingDays: { $gte: daysThreshold },
    })
  )
    .sort({ agingDays: -1 })
    .lean();

  const now = Date.now();
  return {
    total: agingItems.length,
    vendorName,
    items: agingItems.map((item) => {
      const lastUpdated = item.lastUpdated ? new Date(item.lastUpdated).getTime() : now;
      const daysInStock = Math.floor((now - lastUpdated) / 86400000);
      const agingDays = item.agingDays || daysInStock;
      const daysToExpiry = item.expiryDate
        ? Math.floor((new Date(item.expiryDate).getTime() - now) / 86400000)
        : null;
      return {
        id: item._id.toString(),
        sku: item.sku,
        product: item.name || item.sku,
        batchId: item.batchId || item.sku,
        warehouse: item.location || 'Chennai Hub',
        quantity: item.quantity || 0,
        unit: item.unit || 'units',
        daysInStock,
        agingDays,
        expiryDate: item.expiryDate,
        daysToExpiry,
        status: agingDays > 60 ? 'Critical' : agingDays > 30 ? 'Warning' : 'Safe',
        vendor: vendorName,
      };
    }),
  };
}

async function getKPIs(vendorId) {
  const summary = await getInventorySummary(vendorId);
  const stockouts = await listStockouts(vendorId);
  const agingAlerts = await listAgingAlerts(vendorId, {});
  const agingInventory = await listAgingInventory(vendorId, { daysThreshold: 30 });

  const totalValue = await InventoryItem.aggregate([
    { $match: mergeHubFilter({ vendorId }) },
    {
      $group: {
        _id: null,
        totalValue: { $sum: { $multiply: ['$quantity', { $ifNull: ['$unitPrice', 0] }] } },
      },
    },
  ]);
  const value = totalValue[0]?.totalValue || 0;

  return {
    kpis: [
      { id: 'totalSkus', label: 'Total SKUs', value: String(summary.totalSkus || 0), trend: '', trendValue: '', trendDirection: 'stable', status: 'good', color: '#10B981', bgColor: '#ECFDF5', subMetrics: [] },
      { id: 'totalValue', label: 'Total Inventory Value', value: `₹${(value / 1000).toFixed(1)}K`, trend: '', trendValue: '', trendDirection: 'stable', status: 'good', color: '#3B82F6', bgColor: '#EFF6FF', subMetrics: [] },
      { id: 'lowStock', label: 'Low Stock SKUs', value: String(summary.lowStockCount || 0), trend: '', trendValue: '', trendDirection: 'stable', status: summary.lowStockCount > 0 ? 'warning' : 'good', color: '#F59E0B', bgColor: '#FFFBEB', subMetrics: [] },
      { id: 'stockouts', label: 'Stockouts', value: String(stockouts.total || 0), trend: '', trendValue: '', trendDirection: 'stable', status: stockouts.total > 0 ? 'critical' : 'good', color: '#EF4444', bgColor: '#FEF2F2', subMetrics: [] },
      { id: 'agingAlerts', label: 'Aging Alerts', value: String(agingAlerts.total || 0), trend: '', trendValue: '', trendDirection: 'stable', status: agingAlerts.total > 0 ? 'warning' : 'good', color: '#F59E0B', bgColor: '#FFFBEB', subMetrics: [] },
      { id: 'agingInventory', label: 'Aging Inventory (30+ days)', value: String(agingInventory.total || 0), trend: '', trendValue: '', trendDirection: 'stable', status: agingInventory.total > 0 ? 'warning' : 'good', color: '#8B5CF6', bgColor: '#F5F3FF', subMetrics: [] },
    ],
  };
}

async function bulkReorder(vendorId, payload = {}) {
  const ids = Array.isArray(payload.stockoutIds) ? payload.stockoutIds : [];
  const filter = ids.length
    ? mergeHubFilter({ vendorId, _id: { $in: ids } })
    : mergeHubFilter({ vendorId, $or: [{ available: { $lte: 0 } }, { quantity: { $lte: 0 } }] });
  const targets = await InventoryItem.find(filter).lean();
  const PurchaseOrder = require('../models/PurchaseOrder');
  const created = [];
  for (const item of targets) {
    const po = await PurchaseOrder.create({
      ...hubFieldsForCreate(),
      vendorId,
      status: 'draft',
      items: [{ sku: item.sku, quantity: Math.max(50, item.quantity || 10), unitPrice: item.unitPrice || 0 }],
      totals: { subTotal: 0, grandTotal: 0 },
      reference: `REORDER-${item.sku}-${Date.now()}`,
    });
    created.push({ sku: item.sku, poId: String(po._id) });
  }
  return {
    vendorId,
    action: 'bulk_reorder',
    total: targets.length,
    reorderedIds: targets.map((x) => String(x._id)),
    purchaseOrders: created,
    triggeredAt: new Date().toISOString(),
  };
}

async function alertAllVendors(vendorId, payload = {}) {
  const stockouts = await listStockouts(vendorId);
  const Alert = require('../models/Alert');
  const created = [];
  for (const item of stockouts.items || []) {
    const alert = await Alert.create({
      ...hubFieldsForCreate(),
      vendorId,
      alertId: `ALT-STK-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      title: `Stockout: ${item.product}`,
      productName: item.product,
      type: 'stockout',
      message: String(payload.message || 'Stockout detected, please replenish inventory immediately.'),
      severity: 'high',
      status: 'open',
    });
    created.push(String(alert._id));
  }
  return {
    vendorId,
    action: 'alert_all_vendors',
    totalAlertsCreated: created.length,
    alertIds: created,
    triggeredAt: new Date().toISOString(),
  };
}

async function initiateReturn(vendorId, payload) {
  const item = await InventoryItem.findOne(
    mergeHubFilter({ _id: payload.inventoryItemId, vendorId })
  );
  if (!item) {
    const err = new Error('Inventory item not found');
    err.status = 404;
    throw err;
  }
  const RTV = require('../models/RTV');
  const vendorName = await resolveVendorName(vendorId);
  const rtv = new RTV({
    ...hubFieldsForCreate(),
    rtvNumber: `RTV-INV-${Date.now()}`,
    grnId: String(item._id),
    grnReference: `INV-${item.sku}`,
    vendorId,
    vendor: vendorName,
    reason: payload.reason || 'Damaged Goods',
    quantity: `${item.quantity || 0} ${item.unit || 'units'}`,
    status: 'OPEN',
    items: [`${item.name || item.sku} - ${item.quantity} ${item.unit || 'units'}`],
  });
  await rtv.save();

  item.quantity = 0;
  item.available = 0;
  item.physicalQty = 0;
  item.lastUpdated = new Date();
  await item.save();

  const Alert = require('../models/Alert');
  await Alert.updateMany(
    mergeHubFilter({ vendorId, productName: item.name, type: { $in: ['aging', 'expiry'] } }),
    { $set: { status: 'resolved', acknowledged: true } }
  );

  return {
    reference: rtv.rtvNumber,
    rtvId: String(rtv._id),
    inventoryItemId: String(item._id),
  };
}

async function initiateLiquidation(vendorId, payload) {
  const item = await InventoryItem.findOne(
    mergeHubFilter({ _id: payload.inventoryItemId, vendorId })
  );
  if (!item) {
    const err = new Error('Inventory item not found');
    err.status = 404;
    throw err;
  }
  const discount = Math.min(100, Math.max(0, Number(payload.discountPercent ?? 30)));
  const qty = item.quantity || 0;
  const liquidatedQty = Math.floor(qty * (discount / 100));
  const remaining = Math.max(0, qty - liquidatedQty);

  item.quantity = remaining;
  item.available = Math.max(0, remaining - (item.reserved || 0));
  item.physicalQty = remaining;
  item.lastUpdated = new Date();
  await item.save();

  const Alert = require('../models/Alert');
  await Alert.create({
    ...hubFieldsForCreate(),
    vendorId,
    alertId: `LIQ-${Date.now()}`,
    title: `Liquidated: ${item.name || item.sku}`,
    productName: item.name || item.sku,
    batchId: item.batchId || item.sku,
    type: 'liquidation',
    message: `Liquidated ${liquidatedQty} units at ${discount}% discount`,
    severity: 'medium',
    status: 'resolved',
    acknowledged: true,
    quantity: liquidatedQty,
    value: Math.round((item.unitPrice || 0) * liquidatedQty * (1 - discount / 100)),
  });

  return {
    reference: `LIQ-${item.sku}-${Date.now()}`,
    liquidatedQty,
    remainingQty: remaining,
    recoveryValue: Math.round((item.unitPrice || 0) * liquidatedQty * (1 - discount / 100)),
  };
}


async function getSupplyPerformance(vendorId) {
  const vendorMetricsService = require('./vendorMetricsService');
  const Vendor = require('../models/Vendor');
  const Shipment = require('../models/Shipment');
  const PurchaseOrder = require('../models/PurchaseOrder');
  const Alert = require('../models/Alert');
  const GRN = require('../models/GRN');

  const vendorName = await resolveVendorName(vendorId);
  const [summary, kpisPayload, stockouts, agingAlerts, agingInv, vendorPerf] = await Promise.all([
    getInventorySummary(vendorId),
    getKPIs(vendorId),
    listStockouts(vendorId),
    listAgingAlerts(vendorId, {}),
    listAgingInventory(vendorId, { daysThreshold: 30 }),
    vendorMetricsService.getPerformance(vendorId),
  ]);

  const openPOStatuses = [
    'pending_approval',
    'approved',
    'sent',
    'on_hold',
    'partially_received',
  ];
  const openPOFilter = { archived: { $ne: true }, status: { $in: openPOStatuses } };

  const [
    totalVendors,
    activeVendors,
    openPOs,
    criticalAlerts,
    totalDeliveries,
    onTimeDeliveries,
    totalGRNs,
    approvedGRNs,
  ] = await Promise.all([
    Vendor.countDocuments(mergeHubFilter({})),
    Vendor.countDocuments(mergeHubFilter({ status: 'active' })),
    PurchaseOrder.countDocuments(mergeHubFilter(openPOFilter)),
    Alert.countDocuments(mergeHubFilter({ status: 'open', severity: 'critical' })),
    Shipment.countDocuments(
      mergeHubFilter({
        estimatedArrival: { $exists: true, $ne: null },
        deliveredAt: { $exists: true, $ne: null },
      })
    ),
    Shipment.countDocuments(
      mergeHubFilter({
        estimatedArrival: { $exists: true, $ne: null },
        deliveredAt: { $exists: true, $ne: null },
        $expr: { $lte: ['$deliveredAt', '$estimatedArrival'] },
      })
    ),
    GRN.countDocuments(mergeHubFilter({ vendorId })),
    GRN.countDocuments(mergeHubFilter({ vendorId, status: { $in: ['APPROVED', 'approved', 'Approved'] } })),
  ]);

  const deliveryTimeliness =
    totalDeliveries === 0
      ? null
      : Math.round((onTimeDeliveries / totalDeliveries) * 1000) / 10;
  const hubSlaCompliance =
    totalGRNs === 0 ? null : Math.round((approvedGRNs / totalGRNs) * 1000) / 10;

  const fmtPct = (v) => (v == null || Number.isNaN(v) ? '—' : `${v}%`);
  const fmtNum = (v) => (v == null || v === '' ? '—' : String(v));
  const fmtMoney = (v) =>
    v == null || Number.isNaN(Number(v)) ? '—' : `₹${Math.round(Number(v)).toLocaleString('en-IN')}`;

  const kpiById = Object.fromEntries((kpisPayload.kpis || []).map((k) => [k.id, k]));

  const items = [
    { id: 'hub_delivery', label: 'Delivery timeliness (hub)', value: fmtPct(deliveryTimeliness), group: 'Hub', tone: deliveryTimeliness != null && deliveryTimeliness >= 90 ? 'good' : deliveryTimeliness != null && deliveryTimeliness >= 70 ? 'warning' : 'neutral' },
    { id: 'hub_active_vendors', label: 'Active vendors (hub)', value: fmtNum(activeVendors), group: 'Hub', tone: 'neutral' },
    { id: 'hub_total_vendors', label: 'Total vendors (hub)', value: fmtNum(totalVendors), group: 'Hub', tone: 'neutral' },
    { id: 'hub_open_pos', label: 'Open POs (hub)', value: fmtNum(openPOs), group: 'Hub', tone: openPOs > 0 ? 'warning' : 'good' },
    { id: 'hub_critical_alerts', label: 'Critical alerts (hub)', value: fmtNum(criticalAlerts), group: 'Hub', tone: criticalAlerts > 0 ? 'critical' : 'good' },
    { id: 'hub_sla', label: 'GRN SLA compliance (vendor)', value: fmtPct(hubSlaCompliance), group: 'Hub', tone: hubSlaCompliance != null && hubSlaCompliance >= 85 ? 'good' : 'warning' },
    { id: 'inv_total_skus', label: 'Total SKUs', value: fmtNum(summary.totalSkus ?? kpiById.totalSkus?.value), group: 'Inventory', tone: 'neutral' },
    { id: 'inv_total_qty', label: 'Total quantity on hand', value: fmtNum(summary.totalQuantity), group: 'Inventory', tone: 'neutral' },
    { id: 'inv_low_stock', label: 'Low stock SKUs', value: fmtNum(summary.lowStockCount ?? kpiById.lowStock?.value), group: 'Inventory', tone: (summary.lowStockCount || 0) > 0 ? 'warning' : 'good' },
    { id: 'inv_total_value', label: 'Inventory value', value: kpiById.totalValue?.value || '—', group: 'Inventory', tone: 'neutral' },
    { id: 'inv_stockouts', label: 'Stockout SKUs', value: fmtNum(stockouts.total ?? kpiById.stockouts?.value), group: 'Inventory', tone: (stockouts.total || 0) > 0 ? 'critical' : 'good' },
    { id: 'inv_aging_alerts', label: 'Aging alerts', value: fmtNum(agingAlerts.total ?? kpiById.agingAlerts?.value), group: 'Inventory', tone: (agingAlerts.total || 0) > 0 ? 'warning' : 'good' },
    { id: 'inv_aging_30d', label: 'Aging inventory (30+ days)', value: fmtNum(agingInv.total ?? kpiById.agingInventory?.value), group: 'Inventory', tone: (agingInv.total || 0) > 0 ? 'warning' : 'good' },
    { id: 'inv_last_sync', label: 'Last inventory sync', value: summary.lastSync ? new Date(summary.lastSync).toLocaleString() : '—', group: 'Inventory', tone: 'neutral' },
    { id: 'vend_overall', label: 'Vendor overall score', value: fmtPct(vendorPerf.overallScore), group: 'Vendor', tone: vendorPerf.overallScore >= 85 ? 'good' : vendorPerf.overallScore >= 70 ? 'warning' : 'critical' },
    { id: 'vend_delivery', label: 'Vendor delivery timeliness', value: fmtPct(vendorPerf.deliveryTimelinessPct), group: 'Vendor', tone: 'neutral' },
    { id: 'vend_quality', label: 'Product quality (QC pass rate)', value: fmtPct(vendorPerf.productQualityPct), group: 'Vendor', tone: 'neutral' },
    { id: 'vend_fulfillment', label: 'Order fulfillment rate', value: fmtPct(vendorPerf.orderFulfillmentPct), group: 'Vendor', tone: 'neutral' },
    { id: 'vend_po_total', label: 'Purchase orders (total)', value: fmtNum(vendorPerf.purchaseOrders?.total), group: 'Vendor', tone: 'neutral' },
    { id: 'vend_po_pending', label: 'Purchase orders (pending)', value: fmtNum(vendorPerf.purchaseOrders?.pending), group: 'Vendor', tone: (vendorPerf.purchaseOrders?.pending || 0) > 0 ? 'warning' : 'good' },
    { id: 'vend_grn_total', label: 'GRNs (total)', value: fmtNum(vendorPerf.grn?.total), group: 'Vendor', tone: 'neutral' },
    { id: 'vend_grn_approved', label: 'GRNs approved', value: fmtNum(vendorPerf.grn?.approved), group: 'Vendor', tone: 'good' },
    { id: 'vend_qc_passed', label: 'QC checks passed', value: fmtNum(vendorPerf.qc?.passed), group: 'Vendor', tone: 'good' },
    { id: 'vend_qc_failed', label: 'QC checks failed', value: fmtNum(vendorPerf.qc?.failed), group: 'Vendor', tone: (vendorPerf.qc?.failed || 0) > 0 ? 'critical' : 'good' },
    { id: 'vend_revenue', label: 'PO revenue (vendor)', value: fmtMoney(vendorPerf.totalRevenue), group: 'Vendor', tone: 'neutral' },
    { id: 'vend_complaints', label: 'Complaints (30d)', value: fmtNum(vendorPerf.complaintsLast30d), group: 'Vendor', tone: (vendorPerf.complaintsLast30d || 0) > 0 ? 'warning' : 'good' },
  ];

  return {
    vendorId,
    vendorName,
    generatedAt: new Date().toISOString(),
    deliveryTimelinessPct: deliveryTimeliness,
    slaCompliancePct: hubSlaCompliance,
    hub: {
      totalVendors,
      activeVendors,
      openPOs,
      criticalAlerts,
      deliveryTimeliness,
      slaCompliance: hubSlaCompliance,
    },
    inventory: summary,
    kpis: kpisPayload.kpis || [],
    vendorPerformance: vendorPerf,
    items,
  };
}


module.exports = {
  getInventorySummary,
  listStock,
  triggerSync,
  reconcile,
  listAgingAlerts,
  listStockouts,
  listAgingInventory,
  getKPIs,
  bulkReorder,
  alertAllVendors,
  initiateReturn,
  initiateLiquidation,
  getSupplyPerformance,
  listHubAgingAlerts,
  deriveAgingAlertsFromInventory,
};
