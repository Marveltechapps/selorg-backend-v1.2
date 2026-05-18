const mongoose = require('mongoose');

const salesAnalyticsSchema = new mongoose.Schema({
  analyticsId: {
    type: String,
    required: true,
    unique: true,
  },
  date: {
    type: Date,
    default: Date.now,
  },
  period: {
    type: String,
    enum: ['DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY'],
  },
  metrics: {
    totalSales: Number,
    totalUnits: Number,
    averageOrderValue: Number,
    conversionRate: Number,
    transactionCount: Number,
    uniqueCustomers: Number,
  },
  categoryBreakdown: [{
    category: String,
    sales: Number,
    units: Number,
    percentage: Number,
  }],
  skuPerformance: [{
    sku: String,
    sales: Number,
    units: Number,
    rank: Number,
  }],
  regionPerformance: [{
    region: String,
    sales: Number,
    units: Number,
  }],
  trends: {
    weekOverWeek: Number,
    monthOverMonth: Number,
    yearOverYear: Number,
  },
  topPerformers: {
    topSKU: String,
    topCategory: String,
    topRegion: String,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
}, { collection: 'sales_analytics' });

salesAnalyticsSchema.index({ date: -1 });
salesAnalyticsSchema.index({ period: 1 });

const InventoryAnalyticsSchema = new mongoose.Schema({
  analyticsId: {
    type: String,
    required: true,
    unique: true,
  },
  date: {
    type: Date,
    default: Date.now,
  },
  metrics: {
    totalInventory: Number,
    totalSKUs: Number,
    averageInventoryAge: Number,
    turnoverRate: Number,
    stockOutPercentage: Number,
    overStockPercentage: Number,
  },
  warehouseMetrics: [{
    warehouseId: String,
    inventory: Number,
    utilization: Number,
    turnover: Number,
  }],
  riskIndicators: {
    slowMovingCount: Number,
    deadStockCount: Number,
    expiringCount: Number,
    lowStockCount: Number,
  },
  valueAnalysis: {
    totalInventoryValue: Number,
    highValueItems: Number,
    slowMovingValue: Number,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
}, { collection: 'inventory_analytics' });

InventoryAnalyticsSchema.index({ date: -1 });

const DemandForecastSchema = new mongoose.Schema({
  forecastId: {
    type: String,
    required: true,
    unique: true,
  },
  sku: {
    type: String,
    required: true,
  },
  forecastPeriod: {
    startDate: Date,
    endDate: Date,
    daysAhead: Number,
  },
  forecasts: [{
    date: Date,
    predictedDemand: Number,
    confidence: Number,
    lower_bound: Number,
    upper_bound: Number,
  }],
  method: {
    type: String,
    enum: ['TIME_SERIES', 'REGRESSION', 'SEASONAL', 'ML_MODEL'],
  },
  accuracy: {
    mape: Number, // Mean Absolute Percentage Error
    rmse: Number, // Root Mean Square Error
    mae: Number,  // Mean Absolute Error
  },
  factors: {
    seasonality: Number,
    trend: Number,
    autocorrelation: Number,
  },
  lastUpdated: Date,
  createdAt: {
    type: Date,
    default: Date.now,
  },
}, { collection: 'demand_forecasts' });

DemandForecastSchema.index({ sku: 1 });
DemandForecastSchema.index({ forecastId: 1 });

const SalesForecastSchema = new mongoose.Schema({
  forecastId: {
    type: String,
    required: true,
    unique: true,
  },
  forecastPeriod: {
    startDate: Date,
    endDate: Date,
    daysAhead: Number,
  },
  forecasts: [{
    date: Date,
    predictedSales: Number,
    predictedUnits: Number,
    confidence: Number,
  }],
  scenarioAnalysis: [{
    scenario: { type: String, enum: ['PESSIMISTIC', 'BASE', 'OPTIMISTIC'] },
    salesForecast: Number,
    unitsForecast: Number,
  }],
  method: String,
  accuracy: {
    mape: Number,
    rmse: Number,
  },
  assumptions: [String],
  lastUpdated: Date,
  createdAt: {
    type: Date,
    default: Date.now,
  },
}, { collection: 'sales_forecasts' });

SalesForecastSchema.index({ forecastId: 1 });

module.exports = {
  SalesAnalytics: mongoose.model('SalesAnalytics', salesAnalyticsSchema),
  InventoryAnalytics: mongoose.model('InventoryAnalytics', InventoryAnalyticsSchema),
  DemandForecast: mongoose.model('DemandForecast', DemandForecastSchema),
  SalesForecast: mongoose.model('SalesForecast', SalesForecastSchema),
};
