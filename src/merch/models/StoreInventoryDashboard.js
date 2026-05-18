const mongoose = require('mongoose');
const { Schema } = mongoose;

const StoreInventoryDashboardSchema = new Schema({
  dashboardId: { type: String, required: true, unique: true, index: true },
  storeId: { type: String, required: true, trim: true, index: true },
  date: { type: Date, default: () => new Date(new Date().setHours(0, 0, 0, 0)), index: true },
  period: {
    type: String,
    enum: ['daily', 'weekly', 'monthly'],
    default: 'daily'
  },
  overallHealth: {
    status: { type: String, enum: ['critical', 'warning', 'healthy', 'excellent'] },
    score: { type: Number, min: 0, max: 100 },
    trend: { type: String, enum: ['improving', 'stable', 'declining'] }
  },
  stock: {
    totalSKUs: { type: Number, default: 0 },
    activeProducts: { type: Number, default: 0 },
    outOfStockProducts: { type: Number, default: 0 },
    lowStockProducts: { type: Number, default: 0 },
    overStockProducts: { type: Number, default: 0 },
    totalUnits: { type: Number, default: 0 },
    totalValue: { type: Number, default: 0 },
    averageUnitValue: { type: Number, default: 0 },
    fastMoving: { type: Number, default: 0 }, // SKUs with high turnover
    slowMoving: { type: Number, default: 0 }, // SKUs with low turnover
    deadStock: { type: Number, default: 0 } // No sales in 90+ days
  },
  expiry: {
    totalBatches: { type: Number, default: 0 },
    expiringIn30Days: { type: Number, default: 0 },
    expiringIn7Days: { type: Number, default: 0 },
    expiredBatches: { type: Number, default: 0 },
    totalExpiryWaste: { type: Number, default: 0 },
    expiredUnits: { type: Number, default: 0 },
    expiryRate: { type: Number }, // % of inventory expiring
    lastExpiryCheck: { type: Date }
  },
  sales: {
    totalSales24h: { type: Number, default: 0 },
    totalSales7d: { type: Number, default: 0 },
    totalSales30d: { type: Number, default: 0 },
    averageDailySales: { type: Number, default: 0 },
    bestsellers: [{
      sku: { type: String },
      unitsSold: { type: Number },
      revenue: { type: Number }
    }],
    slowSellers: [{
      sku: { type: String },
      unitsSold: { type: Number },
      daysSinceLastSale: { type: Number }
    }],
    conversionRate: { type: Number }, // Orders / View sessions
    revenue24h: { type: Number, default: 0 },
    revenue7d: { type: Number, default: 0 },
    revenue30d: { type: Number, default: 0 }
  },
  replenishment: {
    ordersPending: { type: Number, default: 0 },
    ordersInTransit: { type: Number, default: 0 },
    expectedArrivalQty: { type: Number, default: 0 },
    ordersOverdue: { type: Number, default: 0 },
    lastReplenishmentDate: { type: Date },
    nextReplenishmentDate: { type: Date },
    averageReplenishmentCycle: { type: Number }, // days
    totalReplenishmentCost30d: { type: Number, default: 0 }
  },
  quality: {
    damageReportsOpen: { type: Number, default: 0 },
    damageRate: { type: Number }, // % damaged items
    receivingAccuracy: { type: Number }, // % of orders received correctly
    countAccuracy: { type: Number }, // Stock count vs system
    lastReconciliation: { type: Date },
    discrepancyRate: { type: Number } // % variance in reconciliation
  },
  costAnalysis: {
    totalInventoryCost: { type: Number, default: 0 },
    carryingCost: { type: Number, default: 0 }, // Storage, insurance, etc.
    wasteAmount: { type: Number, default: 0 },
    obsoleteValue: { type: Number, default: 0 },
    costOfSalesHold: { type: Number, default: 0 }, // Lost revenue from oos
    roi: { type: Number }, // Return on inventory investment %
    turnoverRatio: { type: Number } // Inventory turnover
  },
  alerts: [{
    type: { type: String, enum: ['stock_out', 'low_stock', 'overstock', 'expiry', 'damage', 'quality', 'performance'] },
    severity: { type: String, enum: ['info', 'warning', 'critical'] },
    message: { type: String },
    affectedSKUs: { type: Number },
    createdAt: { type: Date, default: Date.now },
    resolved: { type: Boolean, default: false }
  }],
  recommendations: [{
    type: { type: String, enum: ['increase_stock', 'reduce_stock', 'discontinue', 'promote', 'bundle', 'clearance'] },
    sku: { type: String },
    reason: { type: String },
    expectedImpact: { type: String },
    priority: { type: String, enum: ['low', 'medium', 'high'] },
    estimatedRevenue: { type: Number }
  }],
  metadata: {
    lastCalculatedAt: { type: Date, default: Date.now },
    calculatedBy: { type: String, trim: true },
    dataSource: { type: String }, // 'automated', 'manual'
    nextCalculationScheduled: { type: Date },
    notes: { type: String, trim: true }
  }
}, {
  timestamps: true,
  collection: 'store_inventory_dashboards'
});

// Indexes
StoreInventoryDashboardSchema.index({ dashboardId: 1 });
StoreInventoryDashboardSchema.index({ storeId: 1, date: -1 });
StoreInventoryDashboardSchema.index({ storeId: 1, period: 1, date: -1 });

// Methods
StoreInventoryDashboardSchema.methods.calculateHealthScore = function() {
  let score = 100;

  // Deduct for stock issues
  if (this.stock.outOfStockProducts > 0) {
    score -= Math.min(20, this.stock.outOfStockProducts * 2);
  }
  if (this.stock.lowStockProducts > 0) {
    score -= Math.min(15, this.stock.lowStockProducts);
  }

  // Deduct for expiry
  if (this.expiry.expiredBatches > 0) {
    score -= Math.min(20, this.expiry.expiredBatches * 5);
  }

  // Deduct for quality
  if (this.quality.countAccuracy && this.quality.countAccuracy < 95) {
    score -= (95 - this.quality.countAccuracy);
  }

  // Deduct for slow movers
  if (this.stock.slowMoving > 0) {
    score -= Math.min(10, this.stock.slowMoving * 0.5);
  }

  this.overallHealth.score = Math.max(0, score);
  this.determineHealthStatus();

  return this.overallHealth.score;
};

StoreInventoryDashboardSchema.methods.determineHealthStatus = function() {
  const score = this.overallHealth.score;

  if (score >= 80) {
    this.overallHealth.status = 'excellent';
  } else if (score >= 60) {
    this.overallHealth.status = 'healthy';
  } else if (score >= 40) {
    this.overallHealth.status = 'warning';
  } else {
    this.overallHealth.status = 'critical';
  }
};

StoreInventoryDashboardSchema.methods.generateRecommendations = function() {
  this.recommendations = [];

  // Stock out recommendations
  if (this.stock.outOfStockProducts > 5) {
    this.recommendations.push({
      type: 'increase_stock',
      reason: `${this.stock.outOfStockProducts} products out of stock`,
      priority: 'high',
      expectedImpact: 'Reduce stockouts and lost sales'
    });
  }

  // Overstock recommendations
  if (this.stock.overStockProducts > 10) {
    this.recommendations.push({
      type: 'reduce_stock',
      reason: `${this.stock.overStockProducts} products overstock`,
      priority: 'medium',
      expectedImpact: 'Reduce carrying costs'
    });
  }

  // Slow mover recommendations
  if (this.stock.slowMoving > 0) {
    this.recommendations.push({
      type: 'promote',
      reason: `${this.stock.slowMoving} slow-moving SKUs`,
      priority: 'medium',
      expectedImpact: 'Increase turnover'
    });
  }

  // Expiry clearance recommendations
  if (this.expiry.expiringIn7Days > 0) {
    this.recommendations.push({
      type: 'clearance',
      reason: `${this.expiry.expiringIn7Days} batches expiring within 7 days`,
      priority: 'high',
      expectedImpact: 'Reduce waste'
    });
  }
};

StoreInventoryDashboardSchema.statics.createDashboard = async function(data) {
  const dashboardId = `DASH_${data.storeId}_${Date.now()}`;

  return this.create({
    dashboardId,
    ...data
  });
};

StoreInventoryDashboardSchema.statics.getLatestDashboard = function(storeId) {
  return this.findOne({ storeId })
    .sort({ date: -1 });
};

StoreInventoryDashboardSchema.statics.getDashboardHistory = function(storeId, days = 30) {
  const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  return this.find({
    storeId,
    date: { $gte: startDate }
  }).sort({ date: -1 });
};

module.exports = mongoose.models.StoreInventoryDashboard || mongoose.model('StoreInventoryDashboard', StoreInventoryDashboardSchema);
