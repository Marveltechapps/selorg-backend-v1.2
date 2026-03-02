const InventoryItem = require('../models/InventoryItem');
const Job = require('../models/Job');
const { v4: uuidv4 } = require('uuid');

async function getInventorySummary(vendorId, range) {
  const totalSkus = await InventoryItem.countDocuments({ vendorId });
  const agg = await InventoryItem.aggregate([
    { $match: { vendorId } },
    {
      $group: {
        _id: null,
        totalQuantity: { $sum: '$quantity' },
        lowStockCount: {
          $sum: {
            $cond: [{ $lt: ['$available', 10] }, 1, 0],
          },
        },
        lastSync: { $max: '$updatedAt' },
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
  const page = Math.max(1, parseInt(query.page || 1));
  const size = Math.max(1, parseInt(query.size || 50));
  const filter = { vendorId };
  if (query.sku) filter.sku = query.sku;
  if (query.location) filter.location = query.location;
  if (query.agingDaysGt) filter.agingDays = { $gt: Number(query.agingDaysGt) };
  const total = await InventoryItem.countDocuments(filter);
  const items = await InventoryItem.find(filter)
    .skip((page - 1) * size)
    .limit(size)
    .sort({ lastUpdated: -1 })
    .lean();
  return { total, page, size, items };
}

async function triggerSync(vendorId, requestBody) {
  // create a job record for async processing
  const job = new Job({ jobId: uuidv4(), type: 'inventory-sync', status: 'pending', result: { vendorId, requestBody } });
  await job.save();
  return job.toObject();
}

async function reconcile(vendorId, requestBody) {
  const differences = (requestBody.items || []).map((it) => {
    const delta = (it.reportedQty || 0) - (it.expectedQty || 0);
    return {
      sku: it.sku,
      expectedQty: it.expectedQty,
      reportedQty: it.reportedQty,
      delta,
      suggestion: delta < 0 ? 'increase' : delta > 0 ? 'decrease' : 'hold',
    };
  });
  return {
    vendorId,
    generatedAt: new Date().toISOString(),
    differences,
    summary: { totalChecked: differences.length, totalDifferences: differences.filter((d) => d.delta !== 0).length },
  };
}

async function listAgingAlerts(vendorId, opts) {
  const filter = { vendorId };
  if (opts.severity) filter.severity = opts.severity;
  const items = await require('../models/Alert').find(filter).lean();
  return { total: items.length, items };
}

async function listStockouts(vendorId, query) {
  const filter = { vendorId, $or: [{ available: { $lte: 0 } }, { quantity: { $lte: 0 } }] };
  const stockouts = await InventoryItem.find(filter)
    .sort({ lastUpdated: -1 })
    .lean();
  
  return {
    total: stockouts.length,
    items: stockouts.map(item => ({
      id: item._id.toString(),
      product: item.name || item.sku,
      sku: item.sku,
      warehouse: item.location || 'Unknown',
      daysOutOfStock: item.lastUpdated ? Math.floor((Date.now() - new Date(item.lastUpdated).getTime()) / (1000 * 60 * 60 * 24)) : 0,
      lastStockDate: item.lastUpdated,
      priority: (item.available || 0) === 0 ? 'Critical' : 'High',
    })),
  };
}

async function listAgingInventory(vendorId, query) {
  const daysThreshold = parseInt(query.daysThreshold || 30);
  const filter = { 
    vendorId,
    agingDays: { $gte: daysThreshold },
  };
  
  const agingItems = await InventoryItem.find(filter)
    .sort({ agingDays: -1 })
    .lean();
  
  // Calculate days in stock from lastUpdated
  const now = Date.now();
  
  return {
    total: agingItems.length,
    items: agingItems.map(item => {
      const lastUpdated = item.lastUpdated ? new Date(item.lastUpdated).getTime() : now;
      const daysInStock = Math.floor((now - lastUpdated) / (1000 * 60 * 60 * 24));
      const agingDays = item.agingDays || daysInStock;
      
      return {
        id: item._id.toString(),
        product: item.name || item.sku,
        batchId: item.batchId || 'N/A',
        warehouse: item.location || 'Unknown',
        quantity: item.quantity || 0,
        unit: item.unit || 'pcs',
        daysInStock,
        agingDays,
        expiryDate: item.expiryDate,
        daysToExpiry: item.expiryDate ? Math.floor((new Date(item.expiryDate).getTime() - now) / (1000 * 60 * 60 * 24)) : null,
        status: agingDays > 60 ? 'Critical' : agingDays > 30 ? 'Warning' : 'Safe',
      };
    }),
  };
}

async function getKPIs(vendorId, query) {
  const summary = await getInventorySummary(vendorId);
  const stockouts = await listStockouts(vendorId, {});
  const agingAlerts = await listAgingAlerts(vendorId, {});
  const agingInventory = await listAgingInventory(vendorId, { daysThreshold: 30 });
  
  const totalValue = await InventoryItem.aggregate([
    { $match: { vendorId } },
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
      {
        id: 'totalSkus',
        label: 'Total SKUs',
        value: String(summary.totalSkus || 0),
        trend: '',
        trendValue: '',
        trendDirection: 'stable',
        status: 'good',
        color: '#10B981',
        bgColor: '#ECFDF5',
        subMetrics: [],
      },
      {
        id: 'totalValue',
        label: 'Total Inventory Value',
        value: `₹${(value / 1000).toFixed(1)}K`,
        trend: '',
        trendValue: '',
        trendDirection: 'stable',
        status: 'good',
        color: '#3B82F6',
        bgColor: '#EFF6FF',
        subMetrics: [],
      },
      {
        id: 'lowStock',
        label: 'Low Stock SKUs',
        value: String(summary.lowStockCount || 0),
        trend: '',
        trendValue: '',
        trendDirection: 'stable',
        status: summary.lowStockCount > 0 ? 'warning' : 'good',
        color: '#F59E0B',
        bgColor: '#FFFBEB',
        subMetrics: [],
      },
      {
        id: 'stockouts',
        label: 'Stockouts',
        value: String(stockouts.total || 0),
        trend: '',
        trendValue: '',
        trendDirection: 'stable',
        status: stockouts.total > 0 ? 'critical' : 'good',
        color: '#EF4444',
        bgColor: '#FEF2F2',
        subMetrics: [],
      },
      {
        id: 'agingAlerts',
        label: 'Aging Alerts',
        value: String(agingAlerts.total || 0),
        trend: '',
        trendValue: '',
        trendDirection: 'stable',
        status: agingAlerts.total > 0 ? 'warning' : 'good',
        color: '#F59E0B',
        bgColor: '#FFFBEB',
        subMetrics: [],
      },
      {
        id: 'agingInventory',
        label: 'Aging Inventory (30+ days)',
        value: String(agingInventory.total || 0),
        trend: '',
        trendValue: '',
        trendDirection: 'stable',
        status: agingInventory.total > 0 ? 'warning' : 'good',
        color: '#8B5CF6',
        bgColor: '#F5F3FF',
        subMetrics: [],
      },
    ],
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
};

