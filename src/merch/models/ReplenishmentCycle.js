const mongoose = require('mongoose');
const { Schema } = mongoose;

const ReplenishmentCycleSchema = new Schema({
  cycleId: { type: String, required: true, unique: true, index: true },
  storeId: { type: String, required: true, trim: true, index: true },
  cycleType: {
    type: String,
    enum: ['daily', 'weekly', 'bi-weekly', 'monthly', 'manual'],
    required: true
  },
  status: {
    type: String,
    enum: ['planned', 'in_progress', 'completed', 'cancelled', 'failed'],
    default: 'planned',
    index: true
  },
  cycleDate: { type: Date, default: Date.now, index: true },
  items: [{
    sku: { type: String, required: true, trim: true },
    currentStock: { type: Number, required: true },
    minStock: { type: Number, required: true },
    maxStock: { type: Number, required: true },
    reorderQuantity: { type: Number, required: true },
    recommendedOrder: { type: Number },
    actualOrder: { type: Number },
    orderPlaced: { type: Boolean, default: false },
    reason: { type: String }, // 'stock_low', 'stock_out', 'seasonal', 'promotional'
    confidence: { type: Number, min: 0, max: 100 } // Forecast confidence %
  }],
  summary: {
    totalSKUsAnalyzed: { type: Number, default: 0 },
    totalSKUsNeedReplenishment: { type: Number, default: 0 },
    totalOrdersPlaced: { type: Number, default: 0 },
    totalOrderValue: { type: Number, default: 0 },
    estimatedArrivalDate: { type: Date },
    cost: { type: Number, default: 0 },
    ordersCreated: [{ type: mongoose.Schema.Types.ObjectId, ref: 'ReplenishmentOrder' }]
  },
  configuration: {
    autoCreateOrders: { type: Boolean, default: false },
    orderThreshold: { type: Number, default: 0.5 }, // Order at 50% of minStock
    excludeCategories: [{ type: String }],
    vendorPreference: { type: String }, // Primary vendor
    paymentTerms: { type: String } // e.g., 'COD', 'Net-30'
  },
  createdBy: { type: String, required: true, trim: true },
  completedBy: { type: String, trim: true },
  completedAt: { type: Date },
  notes: { type: String, trim: true },
  metadata: {
    forecastAccuracy: { type: Number }, // % accurate from last cycle
    lastCycleDate: { type: Date },
    nextCyclePlanned: { type: Date },
    seasonal: { type: Boolean, default: false },
    promotionActive: { type: Boolean, default: false }
  }
}, {
  timestamps: true,
  collection: 'replenishment_cycles'
});

// Indexes
ReplenishmentCycleSchema.index({ cycleId: 1 });
ReplenishmentCycleSchema.index({ storeId: 1, cycleDate: -1 });
ReplenishmentCycleSchema.index({ status: 1, storeId: 1 });
ReplenishmentCycleSchema.index({ cycleType: 1, cycleDate: -1 });

// Methods
ReplenishmentCycleSchema.methods.calculateRecommendations = function() {
  let totalAnalyzed = 0;
  let needsReplenishment = 0;
  let totalOrderValue = 0;

  this.items.forEach(item => {
    totalAnalyzed++;

    if (item.currentStock <= item.minStock) {
      needsReplenishment++;
      item.recommendedOrder = Math.max(
        item.reorderQuantity,
        item.maxStock - item.currentStock
      );
      item.orderPlaced = false;
    }

    if (item.recommendedOrder) {
      totalOrderValue += item.recommendedOrder * (item.unitCost || 0);
    }
  });

  this.summary.totalSKUsAnalyzed = totalAnalyzed;
  this.summary.totalSKUsNeedReplenishment = needsReplenishment;
  this.summary.totalOrderValue = totalOrderValue;
};

ReplenishmentCycleSchema.methods.createOrders = async function(replenishmentService) {
  const orders = [];

  for (let item of this.items) {
    if (item.recommendedOrder && item.recommendedOrder > 0) {
      const order = await replenishmentService.createReplenishmentOrder({
        storeId: this.storeId,
        sku: item.sku,
        quantity: item.actualOrder || item.recommendedOrder,
        cycleId: this._id,
        configuration: this.configuration
      });

      if (order.success) {
        orders.push(order.order._id);
        item.actualOrder = item.recommendedOrder;
        item.orderPlaced = true;
      }
    }
  }

  this.summary.totalOrdersPlaced = orders.length;
  this.summary.ordersCreated = orders;

  return orders;
};

ReplenishmentCycleSchema.methods.complete = function(completedBy) {
  this.status = 'completed';
  this.completedBy = completedBy;
  this.completedAt = new Date();
};

ReplenishmentCycleSchema.statics.createCycle = async function(data) {
  const cycleId = `REPL_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  return this.create({
    cycleId,
    ...data
  });
};

ReplenishmentCycleSchema.statics.getActiveCycles = function(storeId) {
  return this.find({
    storeId,
    status: { $in: ['planned', 'in_progress'] }
  }).sort({ cycleDate: -1 });
};

ReplenishmentCycleSchema.statics.getCycleHistory = function(storeId, daysBack = 30) {
  const startDate = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000);

  return this.find({
    storeId,
    cycleDate: { $gte: startDate }
  }).sort({ cycleDate: -1 });
};

module.exports = mongoose.models.ReplenishmentCycle || mongoose.model('ReplenishmentCycle', ReplenishmentCycleSchema);
