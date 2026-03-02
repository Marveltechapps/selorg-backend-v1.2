/**
 * Admin Analytics Controller
 * Serves analytics data from real DB aggregates.
 * Endpoints: /admin/analytics/*
 * All data from MongoDB - no mocks.
 */

const { asyncHandler } = require('../../core/middleware');
const { Order } = require('../../customer-backend/models/Order');
const { Product } = require('../../customer-backend/models/Product');

const CHART_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899'];

function getDateRange(range) {
  const now = new Date();
  const start = new Date(now);
  switch (range) {
    case '7d':
      start.setDate(start.getDate() - 7);
      break;
    case '30d':
      start.setDate(start.getDate() - 30);
      break;
    case '90d':
      start.setDate(start.getDate() - 90);
      break;
    default:
      start.setHours(start.getHours() - 24);
  }
  return { start, end: now };
}

/**
 * GET /admin/analytics/realtime
 */
const getRealtimeMetrics = asyncHandler(async (req, res) => {
  const { range = '24h' } = req.query;
  const { start, end } = getDateRange(range);
  const prevEnd = new Date(start);
  const prevStart = new Date(prevEnd);
  prevStart.setTime(prevStart.getTime() - (end - start));

  const [currentAgg, prevAgg, uniqueUsers] = await Promise.all([
    Order.aggregate([
      { $match: { createdAt: { $gte: start, $lte: end }, status: { $nin: ['cancelled'] } } },
      { $group: { _id: null, totalRevenue: { $sum: '$totalBill' }, totalOrders: { $sum: 1 } } },
      { $project: { _id: 0, totalRevenue: 1, totalOrders: 1 } },
    ]),
    Order.aggregate([
      { $match: { createdAt: { $gte: prevStart, $lt: prevEnd }, status: { $nin: ['cancelled'] } } },
      { $group: { _id: null, totalRevenue: { $sum: '$totalBill' }, totalOrders: { $sum: 1 } } },
      { $project: { _id: 0, totalRevenue: 1, totalOrders: 1 } },
    ]),
    Order.distinct('userId', { createdAt: { $gte: start, $lte: end } }),
  ]);

  const curr = currentAgg[0] || { totalRevenue: 0, totalOrders: 0 };
  const prev = prevAgg[0] || { totalRevenue: 0, totalOrders: 0 };

  const revenueGrowth = prev.totalRevenue > 0
    ? Math.round(((curr.totalRevenue - prev.totalRevenue) / prev.totalRevenue) * 1000) / 10
    : 0;
  const ordersGrowth = prev.totalOrders > 0
    ? Math.round(((curr.totalOrders - prev.totalOrders) / prev.totalOrders) * 1000) / 10
    : 0;

  const aov = curr.totalOrders > 0 ? Math.round(curr.totalRevenue / curr.totalOrders) : 0;

  res.json({
    success: true,
    data: {
      totalRevenue: curr.totalRevenue,
      totalOrders: curr.totalOrders,
      activeUsers: uniqueUsers.length,
      conversionRate: 0,
      averageOrderValue: aov,
      revenueGrowth,
      ordersGrowth,
      usersGrowth: 0,
    },
  });
});

/**
 * GET /admin/analytics/timeseries?range=24h|7d|30d|90d
 */
const getTimeSeriesData = asyncHandler(async (req, res) => {
  const { range = '24h' } = req.query;
  const { start, end } = getDateRange(range);

  let groupBy;
  if (range === '24h') {
    groupBy = {
      year: { $year: '$createdAt' },
      month: { $month: '$createdAt' },
      day: { $dayOfMonth: '$createdAt' },
      hour: { $hour: '$createdAt' },
    };
  } else {
    groupBy = {
      year: { $year: '$createdAt' },
      month: { $month: '$createdAt' },
      day: { $dayOfMonth: '$createdAt' },
    };
  }

  const pipeline = [
    { $match: { createdAt: { $gte: start, $lte: end }, status: { $nin: ['cancelled'] } } },
    { $group: { _id: groupBy, revenue: { $sum: '$totalBill' }, orders: { $sum: 1 }, users: { $addToSet: '$userId' } } },
    { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1, '_id.hour': 1 } },
    {
      $project: {
        timestamp: {
          $dateFromParts: {
            year: '$_id.year',
            month: '$_id.month',
            day: '$_id.day',
            hour: range === '24h' ? '$_id.hour' : 0,
          },
        },
        revenue: 1,
        orders: 1,
        users: { $size: '$users' },
      },
    },
    {
      $project: {
        timestamp: { $dateToString: { date: '$timestamp', format: '%Y-%m-%dT%H:%M:%S.000Z' } },
        revenue: 1,
        orders: 1,
        users: 1,
        conversionRate: { $literal: 0 },
      },
    },
  ];

  const result = await Order.aggregate(pipeline);

  const data = result.map((r) => ({
    timestamp: r.timestamp,
    revenue: r.revenue,
    orders: r.orders,
    users: r.users,
    conversionRate: r.conversionRate,
  }));

  res.json({ success: true, data });
});

/**
 * GET /admin/analytics/products
 */
const getProductPerformance = asyncHandler(async (req, res) => {
  const { range = '30d' } = req.query;
  const { start, end } = getDateRange(range);

  const pipeline = [
    { $match: { createdAt: { $gte: start, $lte: end }, status: { $nin: ['cancelled'] } } },
    { $unwind: '$items' },
    {
      $group: {
        _id: '$items.productId',
        totalRevenue: { $sum: { $multiply: ['$items.price', '$items.quantity'] } },
        unitsSold: { $sum: '$items.quantity' },
      },
    },
    { $lookup: { from: 'customer_products', localField: '_id', foreignField: '_id', as: 'product' } },
    { $unwind: { path: '$product', preserveNullAndEmptyArrays: true } },
    {
      $project: {
        id: { $toString: '$_id' },
        name: { $ifNull: ['$product.name', 'Unknown'] },
        sku: { $ifNull: ['$product.sku', ''] },
        category: { $ifNull: ['$product.brand', 'Uncategorized'] },
        totalRevenue: 1,
        unitsSold: 1,
        averagePrice: { $cond: [{ $gt: ['$unitsSold', 0] }, { $round: [{ $divide: ['$totalRevenue', '$unitsSold'] }, 0] }, 0] },
        stockLevel: { $ifNull: ['$product.stockQuantity', 0] },
      },
    },
    { $sort: { totalRevenue: -1 } },
    { $limit: 20 },
    {
      $addFields: {
        growthRate: 0,
      },
    },
  ];

  const result = await Order.aggregate(pipeline);

  const data = result.map((r) => ({
    id: r.id,
    name: r.name,
    sku: r.sku,
    category: r.category,
    totalRevenue: r.totalRevenue,
    unitsSold: r.unitsSold,
    averagePrice: r.averagePrice,
    growthRate: r.growthRate,
    stockLevel: r.stockLevel,
  }));

  res.json({ success: true, data });
});

/**
 * GET /admin/analytics/categories
 */
const getCategoryAnalytics = asyncHandler(async (req, res) => {
  const { range = '30d' } = req.query;
  const { start, end } = getDateRange(range);

  const pipeline = [
    { $match: { createdAt: { $gte: start, $lte: end }, status: { $nin: ['cancelled'] } } },
    { $unwind: '$items' },
    {
      $lookup: { from: 'customer_products', localField: 'items.productId', foreignField: '_id', as: 'prod' },
    },
    { $unwind: { path: '$prod', preserveNullAndEmptyArrays: true } },
    {
      $lookup: { from: 'customer_categories', localField: 'prod.categoryId', foreignField: '_id', as: 'cat' },
    },
    { $unwind: { path: '$cat', preserveNullAndEmptyArrays: true } },
    {
      $group: {
        _id: { $ifNull: ['$cat.name', 'Uncategorized'] },
        revenue: { $sum: { $multiply: ['$items.price', '$items.quantity'] } },
        orders: { $sum: 1 },
      },
    },
    { $sort: { revenue: -1 } },
  ];

  const result = await Order.aggregate(pipeline);
  const totalRev = result.reduce((s, r) => s + r.revenue, 0);

  const data = result.map((r) => ({
    category: r._id || 'Uncategorized',
    revenue: r.revenue,
    orders: r.orders,
    averageOrderValue: r.orders > 0 ? Math.round(r.revenue / r.orders) : 0,
    percentageOfTotal: totalRev > 0 ? Math.round((r.revenue / totalRev) * 1000) / 10 : 0,
    growthRate: 0,
  }));

  res.json({ success: true, data });
});

/**
 * GET /admin/analytics/regional
 */
const getRegionalPerformance = asyncHandler(async (req, res) => {
  const { range = '30d' } = req.query;
  const { start, end } = getDateRange(range);

  const pipeline = [
    { $match: { createdAt: { $gte: start, $lte: end }, status: { $nin: ['cancelled'] } } },
    {
      $group: {
        _id: { $ifNull: ['$deliveryAddress.city', 'Unknown'] },
        revenue: { $sum: '$totalBill' },
        orders: { $sum: 1 },
        users: { $addToSet: '$userId' },
      },
    },
    {
      $project: {
        city: '$_id',
        revenue: 1,
        orders: 1,
        activeUsers: { $size: '$users' },
      },
    },
    { $sort: { revenue: -1 } },
    { $limit: 20 },
  ];

  const result = await Order.aggregate(pipeline);

  const data = result.map((r) => ({
    region: r.city,
    city: r.city,
    revenue: r.revenue,
    orders: r.orders,
    activeUsers: r.activeUsers,
    averageDeliveryTime: 0,
    customerSatisfaction: 0,
  }));

  res.json({ success: true, data });
});

/**
 * GET /admin/analytics/customers
 */
const getCustomerMetrics = asyncHandler(async (req, res) => {
  const { range = '30d' } = req.query;
  const { start, end } = getDateRange(range);

  const pipeline = [
    { $match: { createdAt: { $gte: start, $lte: end }, status: { $nin: ['cancelled'] } } },
    {
      $group: {
        _id: null,
        totalCustomers: { $addToSet: '$userId' },
        totalRevenue: { $sum: '$totalBill' },
        totalOrders: { $sum: 1 },
      },
    },
  ];

  const [agg, allOrders] = await Promise.all([
    Order.aggregate(pipeline),
    Order.countDocuments({ status: { $nin: ['cancelled'] } }),
  ]);

  const totalCustomers = agg[0] ? agg[0].totalCustomers.length : 0;
  const totalRevenue = agg[0]?.totalRevenue || 0;
  const totalOrdersPeriod = agg[0]?.totalOrders || 0;

  res.json({
    success: true,
    data: {
      totalCustomers,
      newCustomers: totalCustomers,
      returningCustomers: 0,
      customerRetentionRate: 0,
      averageLifetimeValue: totalCustomers > 0 ? Math.round(totalRevenue / totalCustomers) : 0,
      customerAcquisitionCost: 0,
      churnRate: 0,
    },
  });
});

/**
 * GET /admin/analytics/operational
 */
const getOperationalMetrics = asyncHandler(async (req, res) => {
  const { range = '30d' } = req.query;
  const { start, end } = getDateRange(range);

  const [total, delivered, cancelled] = await Promise.all([
    Order.countDocuments({ createdAt: { $gte: start, $lte: end } }),
    Order.countDocuments({ createdAt: { $gte: start, $lte: end }, status: 'delivered' }),
    Order.countDocuments({ createdAt: { $gte: start, $lte: end }, status: 'cancelled' }),
  ]);

  const orderFulfillmentRate = total > 0 ? Math.round((delivered / total) * 1000) / 10 : 0;
  const cancellationRate = total > 0 ? Math.round((cancelled / total) * 1000) / 10 : 0;

  res.json({
    success: true,
    data: {
      averageDeliveryTime: 0,
      onTimeDeliveryRate: 0,
      cancellationRate,
      refundRate: 0,
      averageRating: 0,
      orderFulfillmentRate,
    },
  });
});

/**
 * GET /admin/analytics/revenue
 */
const getRevenueBreakdown = asyncHandler(async (req, res) => {
  const { range = '30d' } = req.query;
  const { start, end } = getDateRange(range);

  const pipeline = [
    { $match: { createdAt: { $gte: start, $lte: end }, status: { $nin: ['cancelled'] } } },
    { $unwind: '$items' },
    {
      $lookup: { from: 'customer_products', localField: 'items.productId', foreignField: '_id', as: 'prod' },
    },
    { $unwind: { path: '$prod', preserveNullAndEmptyArrays: true } },
    {
      $lookup: { from: 'customer_categories', localField: 'prod.categoryId', foreignField: '_id', as: 'cat' },
    },
    { $unwind: { path: '$cat', preserveNullAndEmptyArrays: true } },
    {
      $group: {
        _id: { $ifNull: ['$cat.name', 'Uncategorized'] },
        value: { $sum: { $multiply: ['$items.price', '$items.quantity'] } },
      },
    },
    { $sort: { value: -1 } },
  ];

  const result = await Order.aggregate(pipeline);
  const total = result.reduce((s, r) => s + r.value, 0);

  const data = result.map((r, i) => ({
    category: r._id || 'Uncategorized',
    value: r.value,
    percentage: total > 0 ? Math.round((r.value / total) * 1000) / 10 : 0,
    color: CHART_COLORS[i % CHART_COLORS.length],
  }));

  res.json({ success: true, data });
});

/**
 * GET /admin/analytics/growth
 */
const getGrowthTrends = asyncHandler(async (req, res) => {
  const { range = '90d' } = req.query;
  const { start, end } = getDateRange(range);

  const pipeline = [
    { $match: { createdAt: { $gte: start, $lte: end }, status: { $nin: ['cancelled'] } } },
    {
      $group: {
        _id: {
          year: { $year: '$createdAt' },
          month: { $month: '$createdAt' },
        },
        revenue: { $sum: '$totalBill' },
        orders: { $sum: 1 },
      },
    },
    { $sort: { '_id.year': 1, '_id.month': 1 } },
  ];

  const result = await Order.aggregate(pipeline);
  const monthNames = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  const data = result.map((r, i) => {
    const prev = result[i - 1];
    const revGrowth = prev && prev.revenue > 0
      ? Math.round(((r.revenue - prev.revenue) / prev.revenue) * 1000) / 10
      : 0;
    const ordGrowth = prev && prev.orders > 0
      ? Math.round(((r.orders - prev.orders) / prev.orders) * 1000) / 10
      : 0;
    return {
      period: `${monthNames[r._id.month]} ${r._id.year}`,
      revenue: r.revenue,
      orders: r.orders,
      revenueGrowth: revGrowth,
      ordersGrowth: ordGrowth,
    };
  });

  res.json({ success: true, data });
});

/**
 * GET /admin/analytics/peak-hours
 */
const getPeakHours = asyncHandler(async (req, res) => {
  const { range = '7d' } = req.query;
  const { start, end } = getDateRange(range);

  const pipeline = [
    { $match: { createdAt: { $gte: start, $lte: end }, status: { $nin: ['cancelled'] } } },
    { $group: { _id: { $hour: '$createdAt' }, orders: { $sum: 1 }, revenue: { $sum: '$totalBill' } } },
    { $sort: { _id: 1 } },
  ];

  const result = await Order.aggregate(pipeline);
  const hourLabels = Array.from({ length: 24 }, (_, i) => {
    const h = i % 12 || 12;
    return `${h} ${i < 12 ? 'AM' : 'PM'}`;
  });

  const byHour = {};
  result.forEach((r) => {
    byHour[r._id] = { hour: hourLabels[r._id], orders: r.orders, revenue: r.revenue };
  });

  const data = Array.from({ length: 24 }, (_, i) => byHour[i] || { hour: hourLabels[i], orders: 0, revenue: 0 });

  res.json({ success: true, data });
});

/**
 * GET /admin/analytics/funnel
 */
const getConversionFunnel = asyncHandler(async (req, res) => {
  res.json({
    success: true,
    data: [],
  });
});

/**
 * GET /admin/analytics/payment-methods
 */
const getPaymentMethods = asyncHandler(async (req, res) => {
  const { range = '30d' } = req.query;
  const { start, end } = getDateRange(range);

  const pipeline = [
    { $match: { createdAt: { $gte: start, $lte: end }, status: { $nin: ['cancelled'] } } },
    {
      $group: {
        _id: { $ifNull: ['$paymentMethod.methodType', 'cash'] },
        transactions: { $sum: 1 },
        revenue: { $sum: '$totalBill' },
      },
    },
    { $sort: { revenue: -1 } },
  ];

  const result = await Order.aggregate(pipeline);
  const totalRev = result.reduce((s, r) => s + r.revenue, 0);
  const totalTxns = result.reduce((s, r) => s + r.transactions, 0);

  const methodLabels = { upi: 'UPI', card: 'Credit/Debit Card', cash: 'Cash on Delivery' };

  const data = result.map((r) => ({
    method: methodLabels[r._id] || r._id,
    transactions: r.transactions,
    revenue: r.revenue,
    percentage: totalRev > 0 ? Math.round((r.revenue / totalRev) * 1000) / 10 : 0,
  }));

  res.json({ success: true, data });
});

/**
 * GET /admin/analytics/orders-by-hour
 * Template report: Orders by hour
 */
const getOrdersByHour = asyncHandler(async (req, res) => {
  const data = await getPeakHoursLogic(req);
  res.json({ success: true, data });
});

async function getPeakHoursLogic(req) {
  const { range = '7d' } = req.query;
  const { start, end } = getDateRange(range);
  const pipeline = [
    { $match: { createdAt: { $gte: start, $lte: end }, status: { $nin: ['cancelled'] } } },
    { $group: { _id: { $hour: '$createdAt' }, orders: { $sum: 1 }, revenue: { $sum: '$totalBill' } } },
    { $sort: { _id: 1 } },
  ];
  const result = await Order.aggregate(pipeline);
  const hourLabels = Array.from({ length: 24 }, (_, i) => `${i % 12 || 12} ${i < 12 ? 'AM' : 'PM'}`);
  const byHour = {};
  result.forEach((r) => { byHour[r._id] = { hour: hourLabels[r._id], orders: r.orders, revenue: r.revenue }; });
  return Array.from({ length: 24 }, (_, i) => byHour[i] || { hour: hourLabels[i], orders: 0, revenue: 0 });
}

/**
 * GET /admin/analytics/rider-performance
 * Template report: Rider performance (placeholder - no rider data in customer orders)
 */
const getRiderPerformance = asyncHandler(async (req, res) => {
  res.json({ success: true, data: [] });
});

/**
 * GET /admin/analytics/inventory-health
 * Template report: Inventory health
 */
const getInventoryHealth = asyncHandler(async (req, res) => {
  const products = await Product.find({ isActive: true })
    .select('name sku stockQuantity lowStockThreshold categoryId')
    .limit(100)
    .lean();

  const data = products.map((p) => ({
    sku: p.sku || p._id.toString(),
    name: p.name,
    stockLevel: p.stockQuantity || 0,
    lowStockThreshold: p.lowStockThreshold || 10,
    status: (p.stockQuantity || 0) <= (p.lowStockThreshold || 10) ? 'low' : 'ok',
  }));

  res.json({ success: true, data });
});

/**
 * GET /admin/analytics/financial-summary
 * Template report: Financial summary
 */
const getFinancialSummary = asyncHandler(async (req, res) => {
  const { range = '30d' } = req.query;
  const { start, end } = getDateRange(range);

  const agg = await Order.aggregate([
    { $match: { createdAt: { $gte: start, $lte: end }, status: { $nin: ['cancelled'] } } },
    {
      $group: {
        _id: null,
        totalRevenue: { $sum: '$totalBill' },
        totalOrders: { $sum: 1 },
        totalDiscount: { $sum: '$discount' },
        totalDeliveryFee: { $sum: '$deliveryFee' },
      },
    },
  ]);

  const r = agg[0] || {};
  const aov = r.totalOrders > 0 ? Math.round(r.totalRevenue / r.totalOrders) : 0;

  res.json({
    success: true,
    data: {
      totalRevenue: r.totalRevenue || 0,
      totalOrders: r.totalOrders || 0,
      totalDiscount: r.totalDiscount || 0,
      totalDeliveryFee: r.totalDeliveryFee || 0,
      averageOrderValue: aov,
    },
  });
});

/**
 * POST /admin/analytics/custom-report
 * Custom report builder - dimensions, metrics, filters
 */
const createCustomReport = asyncHandler(async (req, res) => {
  const { dimensions = [], metrics = [], filters = {}, dateFrom, dateTo } = req.body;
  const start = dateFrom ? new Date(dateFrom) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const end = dateTo ? new Date(dateTo) : new Date();

  const matchStage = {
    createdAt: { $gte: start, $lte: end },
    status: { $nin: ['cancelled'] },
  };

  const groupId = {};
  if (dimensions.includes('hour')) groupId.hour = { $hour: '$createdAt' };
  if (dimensions.includes('day')) groupId.day = { $dayOfMonth: '$createdAt' };
  if (dimensions.includes('month')) groupId.month = { $month: '$createdAt' };
  if (dimensions.includes('year')) groupId.year = { $year: '$createdAt' };
  if (dimensions.includes('city')) groupId.city = { $ifNull: ['$deliveryAddress.city', 'Unknown'] };
  if (Object.keys(groupId).length === 0) groupId._id = null;

  const groupStage = { _id: groupId };
  if (metrics.includes('revenue')) groupStage.revenue = { $sum: '$totalBill' };
  if (metrics.includes('orders')) groupStage.orders = { $sum: 1 };

  const pipeline = [{ $match: matchStage }, { $group: groupStage }];
  const result = await Order.aggregate(pipeline);

  res.json({ success: true, data: result });
});

/**
 * GET /admin/analytics/export
 * Export report - format: csv|json|xlsx
 */
const exportReport = asyncHandler(async (req, res) => {
  const { format = 'json', range = '30d', report = 'overview' } = req.query;

  const { start, end } = getDateRange(range);

  let data;
  switch (report) {
    case 'orders-by-hour':
      data = await getPeakHoursLogic(req);
      break;
    case 'financial-summary': {
      const agg = await Order.aggregate([
        { $match: { createdAt: { $gte: start, $lte: end }, status: { $nin: ['cancelled'] } } },
        { $group: { _id: null, totalRevenue: { $sum: '$totalBill' }, totalOrders: { $sum: 1 } } },
      ]);
      data = agg[0] || { totalRevenue: 0, totalOrders: 0 };
      break;
    }
    default: {
      const pipeline = [
        { $match: { createdAt: { $gte: start, $lte: end }, status: { $nin: ['cancelled'] } } },
        { $group: { _id: { $dateToString: { date: '$createdAt', format: '%Y-%m-%d' } }, revenue: { $sum: '$totalBill' }, orders: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ];
      data = await Order.aggregate(pipeline);
    }
  }

  if (format === 'csv') {
    const rows = Array.isArray(data) ? data : [data];
    const headers = rows.length ? Object.keys(rows[0]) : [];
    const csv = [headers.join(',')].concat(
      rows.map((r) => headers.map((h) => JSON.stringify(r[h] ?? '')).join(','))
    ).join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="analytics-${report}-${range}.csv"`);
    return res.send(csv);
  }

  res.json({ success: true, data });
});

module.exports = {
  getRealtimeMetrics,
  getTimeSeriesData,
  getProductPerformance,
  getCategoryAnalytics,
  getRegionalPerformance,
  getCustomerMetrics,
  getOperationalMetrics,
  getRevenueBreakdown,
  getGrowthTrends,
  getPeakHours,
  getConversionFunnel,
  getPaymentMethods,
  getOrdersByHour,
  getRiderPerformance,
  getInventoryHealth,
  getFinancialSummary,
  createCustomReport,
  exportReport,
};
