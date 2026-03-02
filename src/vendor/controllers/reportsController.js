const PurchaseOrder = require('../models/PurchaseOrder');
const GRN = require('../models/GRN');
const QCCheck = require('../models/QCCheck');
const logger = require('../../core/utils/logger');
const asyncHandler = require('../../middleware/asyncHandler');

/**
 * Get sales overview metrics
 */
const getSalesOverview = asyncHandler(async (req, res) => {
  const { vendorId, startDate, endDate } = req.query;
  
  const filter = {};
  if (vendorId) filter.vendorId = vendorId;
  if (startDate || endDate) {
    filter.createdAt = {};
    if (startDate) filter.createdAt.$gte = new Date(startDate);
    if (endDate) filter.createdAt.$lte = new Date(endDate);
  }

  // Calculate metrics from purchase orders and GRNs
  const [totalOrders, totalRevenue, avgOrderValue] = await Promise.all([
    PurchaseOrder.countDocuments(filter),
    PurchaseOrder.aggregate([
      { $match: filter },
      { $group: { _id: null, total: { $sum: { $ifNull: ['$totals.grandTotal', 0] } } } }
    ]),
    PurchaseOrder.aggregate([
      { $match: filter },
      { $group: { _id: null, avg: { $avg: { $ifNull: ['$totals.grandTotal', 0] } } } }
    ])
  ]);

  const revenue = totalRevenue[0]?.total || 0;
  const avgValue = avgOrderValue[0]?.avg || 0;

  // Calculate growth (compare with previous period)
  const previousStartDate = startDate ? new Date(new Date(startDate).getTime() - (new Date(endDate || Date.now()).getTime() - new Date(startDate).getTime())) : null;
  const previousFilter = { ...filter };
  if (previousStartDate) {
    previousFilter.createdAt = { $lt: new Date(startDate) };
    if (previousStartDate) previousFilter.createdAt.$gte = previousStartDate;
  }

  const [prevOrders, prevRevenue] = await Promise.all([
    PurchaseOrder.countDocuments(previousFilter),
    PurchaseOrder.aggregate([
      { $match: previousFilter },
      { $group: { _id: null, total: { $sum: { $ifNull: ['$totals.grandTotal', 0] } } } }
    ])
  ]);

  const prevRev = prevRevenue[0]?.total || 0;
  const revenueGrowth = prevRev > 0 ? ((revenue - prevRev) / prevRev) * 100 : 0;
  const ordersGrowth = prevOrders > 0 ? ((totalOrders - prevOrders) / prevOrders) * 100 : 0;
  const avgOrderGrowth = prevOrders > 0 ? ((avgValue - (prevRev / Math.max(prevOrders, 1))) / (prevRev / Math.max(prevOrders, 1))) * 100 : 0;

  // Count unique products
  const products = await PurchaseOrder.distinct('items.productId', filter);
  const prevProducts = await PurchaseOrder.distinct('items.productId', previousFilter);
  const productsGrowth = prevProducts.length > 0 ? ((products.length - prevProducts.length) / prevProducts.length) * 100 : 0;

  res.json({
    success: true,
    data: {
      totalRevenue: Math.round(revenue * 100) / 100,
      revenueGrowth: Math.round(revenueGrowth * 100) / 100,
      totalOrders,
      ordersGrowth: Math.round(ordersGrowth * 100) / 100,
      avgOrderValue: Math.round(avgValue * 100) / 100,
      avgOrderGrowth: Math.round(avgOrderGrowth * 100) / 100,
      totalProducts: products.length,
      productsGrowth: Math.round(productsGrowth * 100) / 100,
    },
    meta: {
      requestId: req.id,
      timestamp: new Date().toISOString(),
    },
  });
});

/**
 * Get sales data by date
 */
const getSalesData = asyncHandler(async (req, res) => {
  const { vendorId, startDate, endDate, groupBy = 'day' } = req.query;
  
  const matchFilter = {};
  if (vendorId) matchFilter.vendorId = vendorId;
  if (startDate || endDate) {
    matchFilter.createdAt = {};
    if (startDate) matchFilter.createdAt.$gte = new Date(startDate);
    if (endDate) matchFilter.createdAt.$lte = new Date(endDate);
  }

  let groupFormat;
  if (groupBy === 'day') {
    groupFormat = { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } };
  } else if (groupBy === 'week') {
    groupFormat = { $dateToString: { format: '%Y-W%V', date: '$createdAt' } };
  } else {
    groupFormat = { $dateToString: { format: '%Y-%m', date: '$createdAt' } };
  }

  const salesData = await PurchaseOrder.aggregate([
    { $match: matchFilter },
    {
      $group: {
        _id: groupFormat,
        revenue: { $sum: { $ifNull: ['$totals.grandTotal', 0] } },
        orders: { $sum: 1 },
        customers: { $addToSet: '$customerId' },
      }
    },
    { $sort: { _id: 1 } },
    {
      $project: {
        date: '$_id',
        revenue: { $round: ['$revenue', 2] },
        orders: 1,
        customers: { $size: '$customers' },
        _id: 0,
      }
    }
  ]);

  res.json({
    success: true,
    data: salesData,
    meta: {
      requestId: req.id,
      timestamp: new Date().toISOString(),
    },
  });
});

/**
 * Get product performance
 */
const getProductPerformance = asyncHandler(async (req, res) => {
  const { vendorId, startDate, endDate, sortBy = 'revenue' } = req.query;
  
  const matchFilter = {};
  if (vendorId) matchFilter.vendorId = vendorId;
  if (startDate || endDate) {
    matchFilter.createdAt = {};
    if (startDate) matchFilter.createdAt.$gte = new Date(startDate);
    if (endDate) matchFilter.createdAt.$lte = new Date(endDate);
  }

  const productPerformance = await PurchaseOrder.aggregate([
    { $match: matchFilter },
    { $unwind: '$items' },
    {
      $group: {
        _id: '$items.productId',
        name: { $first: '$items.productName' },
        category: { $first: '$items.category' },
        unitsSold: { $sum: '$items.quantity' },
        revenue: { $sum: { $multiply: ['$items.quantity', '$items.unitPrice'] } },
      }
    },
    {
      $lookup: {
        from: 'inventoryitems',
        localField: '_id',
        foreignField: 'productId',
        as: 'inventory'
      }
    },
    {
      $project: {
        id: '$_id',
        name: 1,
        category: 1,
        unitsSold: 1,
        revenue: { $round: ['$revenue', 2] },
        stock: { $ifNull: [{ $arrayElemAt: ['$inventory.quantity', 0] }, 0] },
        trend: 'stable', // Would need historical comparison
        growthRate: 0, // Would need historical comparison
        _id: 0,
      }
    }
  ]);

  // Sort
  if (sortBy === 'revenue') {
    productPerformance.sort((a, b) => b.revenue - a.revenue);
  } else if (sortBy === 'units') {
    productPerformance.sort((a, b) => b.unitsSold - a.unitsSold);
  }

  res.json({
    success: true,
    data: productPerformance,
    meta: {
      requestId: req.id,
      timestamp: new Date().toISOString(),
    },
  });
});

/**
 * Get order analytics by status
 */
const getOrderAnalytics = asyncHandler(async (req, res) => {
  const { vendorId, startDate, endDate } = req.query;
  
  const matchFilter = {};
  if (vendorId) matchFilter.vendorId = vendorId;
  if (startDate || endDate) {
    matchFilter.createdAt = {};
    if (startDate) matchFilter.createdAt.$gte = new Date(startDate);
    if (endDate) matchFilter.createdAt.$lte = new Date(endDate);
  }

  const totalOrders = await PurchaseOrder.countDocuments(matchFilter);
  
  const orderAnalytics = await PurchaseOrder.aggregate([
    { $match: matchFilter },
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 },
      }
    },
    {
      $project: {
        status: '$_id',
        count: 1,
        percentage: { $multiply: [{ $divide: ['$count', totalOrders] }, 100] },
        _id: 0,
      }
    }
  ]);

  // Add colors based on status
  const statusColors = {
    'COMPLETED': '#10b981',
    'PENDING': '#f59e0b',
    'CANCELLED': '#ef4444',
    'RETURNED': '#6b7280',
    'PROCESSING': '#3b82f6',
  };

  const analytics = orderAnalytics.map(item => ({
    ...item,
    percentage: Math.round(item.percentage * 100) / 100,
    color: statusColors[item.status] || '#6b7280',
  }));

  res.json({
    success: true,
    data: analytics,
    meta: {
      requestId: req.id,
      timestamp: new Date().toISOString(),
    },
  });
});

/**
 * Get revenue by category
 */
const getRevenueByCategory = asyncHandler(async (req, res) => {
  const { vendorId, startDate, endDate } = req.query;
  
  const matchFilter = {};
  if (vendorId) matchFilter.vendorId = vendorId;
  if (startDate || endDate) {
    matchFilter.createdAt = {};
    if (startDate) matchFilter.createdAt.$gte = new Date(startDate);
    if (endDate) matchFilter.createdAt.$lte = new Date(endDate);
  }

  const [categoryRevenue, totalRevenue] = await Promise.all([
    PurchaseOrder.aggregate([
      { $match: matchFilter },
      { $unwind: '$items' },
      {
        $group: {
          _id: '$items.category',
          revenue: { $sum: { $multiply: ['$items.quantity', '$items.unitPrice'] } },
        }
      },
      { $sort: { revenue: -1 } },
    ]),
    PurchaseOrder.aggregate([
      { $match: matchFilter },
      { $unwind: '$items' },
      {
        $group: {
          _id: null,
          total: { $sum: { $multiply: ['$items.quantity', '$items.unitPrice'] } },
        }
      }
    ])
  ]);

  const total = totalRevenue[0]?.total || 1;
  const colors = ['#10b981', '#3b82f6', '#f59e0b', '#8b5cf6', '#ec4899', '#ef4444', '#6b7280'];

  const revenueByCategory = categoryRevenue.map((item, index) => ({
    category: item._id || 'Uncategorized',
    revenue: Math.round(item.revenue * 100) / 100,
    percentage: Math.round((item.revenue / total) * 10000) / 100,
    color: colors[index % colors.length],
  }));

  res.json({
    success: true,
    data: revenueByCategory,
    meta: {
      requestId: req.id,
      timestamp: new Date().toISOString(),
    },
  });
});

/**
 * Get hourly sales data
 */
const getHourlySales = asyncHandler(async (req, res) => {
  const { vendorId, date } = req.query;
  
  const matchFilter = {};
  if (vendorId) matchFilter.vendorId = vendorId;
  if (date) {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);
    matchFilter.createdAt = { $gte: startOfDay, $lte: endOfDay };
  }

  const hourlySales = await PurchaseOrder.aggregate([
    { $match: matchFilter },
    {
      $group: {
        _id: { $hour: '$createdAt' },
        orders: { $sum: 1 },
        revenue: { $sum: { $ifNull: ['$totals.grandTotal', 0] } },
      }
    },
    { $sort: { _id: 1 } },
    {
      $project: {
        hour: { $concat: [{ $toString: { $cond: [{ $lt: ['$_id', 10] }, { $concat: ['0', { $toString: '$_id' }] }, { $toString: '$_id' }] } }, ':00'] },
        orders: 1,
        revenue: { $round: ['$revenue', 2] },
        _id: 0,
      }
    }
  ]);

  res.json({
    success: true,
    data: hourlySales,
    meta: {
      requestId: req.id,
      timestamp: new Date().toISOString(),
    },
  });
});

/**
 * Get financial summary
 */
const getFinancialSummary = asyncHandler(async (req, res) => {
  const { vendorId, startDate, endDate } = req.query;
  
  const filter = {};
  if (vendorId) filter.vendorId = vendorId;
  if (startDate || endDate) {
    filter.createdAt = {};
    if (startDate) filter.createdAt.$gte = new Date(startDate);
    if (endDate) filter.createdAt.$lte = new Date(endDate);
  }

  const [summary, refunds] = await Promise.all([
    PurchaseOrder.aggregate([
      { $match: filter },
      {
        $group: {
          _id: null,
          grossRevenue: { $sum: { $ifNull: ['$totals.grandTotal', 0] } },
          platformFee: { $sum: { $multiply: [{ $ifNull: ['$totals.grandTotal', 0] }, 0.1] } }, // 10% platform fee
          deliveryCharges: { $sum: { $ifNull: ['$totals.shipping', 0] } },
        }
      }
    ]),
    PurchaseOrder.aggregate([
      { $match: { ...filter, status: 'RETURNED' } },
      {
        $group: {
          _id: null,
          total: { $sum: { $ifNull: ['$totals.grandTotal', 0] } },
        }
      }
    ])
  ]);

  const grossRevenue = summary[0]?.grossRevenue || 0;
  const platformFee = summary[0]?.platformFee || 0;
  const deliveryCharges = summary[0]?.deliveryCharges || 0;
  const refundsAmount = refunds[0]?.total || 0;
  const netRevenue = grossRevenue - platformFee - deliveryCharges - refundsAmount;
  const profitMargin = grossRevenue > 0 ? (netRevenue / grossRevenue) * 100 : 0;

  res.json({
    success: true,
    data: {
      grossRevenue: Math.round(grossRevenue * 100) / 100,
      platformFee: Math.round(platformFee * 100) / 100,
      deliveryCharges: Math.round(deliveryCharges * 100) / 100,
      refunds: Math.round(refundsAmount * 100) / 100,
      netRevenue: Math.round(netRevenue * 100) / 100,
      profitMargin: Math.round(profitMargin * 100) / 100,
    },
    meta: {
      requestId: req.id,
      timestamp: new Date().toISOString(),
    },
  });
});

/**
 * Get customer insights
 */
const getCustomerInsights = asyncHandler(async (req, res) => {
  const { vendorId, startDate, endDate } = req.query;
  
  const matchFilter = {};
  if (vendorId) matchFilter.vendorId = vendorId;
  if (startDate || endDate) {
    matchFilter.createdAt = {};
    if (startDate) matchFilter.createdAt.$gte = new Date(startDate);
    if (endDate) matchFilter.createdAt.$lte = new Date(endDate);
  }

  // Calculate customer metrics from purchase orders
  const [totalOrders, uniqueCustomers, avgOrdersPerCustomer] = await Promise.all([
    PurchaseOrder.countDocuments(matchFilter),
    PurchaseOrder.distinct('createdBy', matchFilter),
    PurchaseOrder.aggregate([
      { $match: matchFilter },
      { $group: { _id: '$createdBy', orderCount: { $sum: 1 } } },
      { $group: { _id: null, avg: { $avg: '$orderCount' } } }
    ])
  ]);

  const customerCount = uniqueCustomers.length;
  const avgOrders = avgOrdersPerCustomer[0]?.avg || 0;

  // Calculate previous period for comparison
  const previousStartDate = startDate ? new Date(new Date(startDate).getTime() - (new Date(endDate || Date.now()).getTime() - new Date(startDate).getTime())) : null;
  const previousFilter = { ...matchFilter };
  if (previousStartDate && startDate) {
    previousFilter.createdAt = { $gte: previousStartDate, $lt: new Date(startDate) };
  }

  const [prevOrders, prevCustomers] = await Promise.all([
    PurchaseOrder.countDocuments(previousFilter),
    PurchaseOrder.distinct('createdBy', previousFilter)
  ]);

  const prevCustomerCount = prevCustomers.length;
  const newCustomers = Math.max(0, customerCount - prevCustomerCount);
  const returningCustomers = Math.min(customerCount, prevCustomerCount);
  const newCustomersChange = prevCustomerCount > 0 ? ((newCustomers / prevCustomerCount) * 100) : 0;
  const returningCustomersChange = prevCustomerCount > 0 ? ((returningCustomers / prevCustomerCount) * 100) : 0;
  const avgOrdersChange = prevOrders > 0 && customerCount > 0 ? (((avgOrders - (prevOrders / Math.max(prevCustomerCount, 1))) / (prevOrders / Math.max(prevCustomerCount, 1))) * 100) : 0;
  const retentionRate = prevCustomerCount > 0 ? (returningCustomers / prevCustomerCount) * 100 : 0;
  const prevRetentionRate = prevCustomerCount > 0 ? (returningCustomers / prevCustomerCount) * 100 : 0;
  const retentionChange = retentionRate - prevRetentionRate;

  res.json({
    success: true,
    data: [
      {
        metric: 'New Customers',
        value: newCustomers,
        change: Math.round(newCustomersChange * 100) / 100,
        trend: newCustomersChange >= 0 ? 'up' : 'down'
      },
      {
        metric: 'Returning Customers',
        value: returningCustomers,
        change: Math.round(returningCustomersChange * 100) / 100,
        trend: returningCustomersChange >= 0 ? 'up' : 'down'
      },
      {
        metric: 'Avg Orders per Customer',
        value: Math.round(avgOrders * 100) / 100,
        change: Math.round(avgOrdersChange * 100) / 100,
        trend: avgOrdersChange >= 0 ? 'up' : 'down'
      },
      {
        metric: 'Customer Retention Rate',
        value: Math.round(retentionRate * 100) / 100,
        change: Math.round(retentionChange * 100) / 100,
        trend: retentionChange >= 0 ? 'up' : 'down'
      }
    ],
    meta: {
      requestId: req.id,
      timestamp: new Date().toISOString(),
    },
  });
});

/**
 * Get top customers
 */
const getTopCustomers = asyncHandler(async (req, res) => {
  const { vendorId, startDate, endDate, limit = 5 } = req.query;
  
  const matchFilter = {};
  if (vendorId) matchFilter.vendorId = vendorId;
  if (startDate || endDate) {
    matchFilter.createdAt = {};
    if (startDate) matchFilter.createdAt.$gte = new Date(startDate);
    if (endDate) matchFilter.createdAt.$lte = new Date(endDate);
  }

  const topCustomers = await PurchaseOrder.aggregate([
    { $match: matchFilter },
    {
      $group: {
        _id: '$createdBy',
        orders: { $sum: 1 },
        totalSpent: { $sum: { $ifNull: ['$totals.grandTotal', 0] } },
      }
    },
    {
      $project: {
        id: '$_id',
        name: { $ifNull: ['$_id', 'Unknown Customer'] },
        email: { $ifNull: ['$_id', 'unknown@example.com'] },
        orders: 1,
        totalSpent: { $round: ['$totalSpent', 2] },
        avgOrderValue: { $round: [{ $divide: ['$totalSpent', '$orders'] }, 2] },
        _id: 0,
      }
    },
    { $sort: { totalSpent: -1 } },
    { $limit: parseInt(limit) }
  ]);

  res.json({
    success: true,
    data: topCustomers,
    meta: {
      requestId: req.id,
      timestamp: new Date().toISOString(),
    },
  });
});

module.exports = {
  getSalesOverview,
  getSalesData,
  getProductPerformance,
  getOrderAnalytics,
  getRevenueByCategory,
  getHourlySales,
  getFinancialSummary,
  getCustomerInsights,
  getTopCustomers,
};
