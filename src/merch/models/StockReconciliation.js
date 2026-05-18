const mongoose = require('mongoose');
const { Schema } = mongoose;

const StockReconciliationSchema = new Schema({
  reconciliationId: { type: String, required: true, unique: true, index: true },
  storeId: { type: String, required: true, trim: true, index: true },
  type: {
    type: String,
    enum: ['cycle_count', 'physical_count', 'automated_audit', 'variance_investigation', 'period_close'],
    required: true
  },
  period: {
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true }
  },
  status: {
    type: String,
    enum: ['scheduled', 'in_progress', 'counting_complete', 'variance_detected', 'resolved', 'approved', 'cancelled'],
    default: 'scheduled',
    index: true
  },
  items: [{
    sku: { type: String, required: true },
    productName: { type: String },
    systemQuantity: { type: Number, required: true },
    countedQuantity: { type: Number },
    variance: { type: Number }, // countedQuantity - systemQuantity
    variancePercentage: { type: Number },
    varianceReason: { type: String, trim: true },
    isResolved: { type: Boolean, default: false },
    resolutionAction: {
      type: String,
      enum: ['accept_system', 'accept_count', 'investigation', 'damage_writeoff', 'found_items'],
      trim: true
    },
    approvalRequired: { type: Boolean, default: false },
    location: { type: String },
    batchNumber: { type: String },
    expiryDate: { type: Date }
  }],
  summary: {
    totalSkus: { type: Number, default: 0 },
    totalSystemValue: { type: Number, default: 0 },
    totalCountedValue: { type: Number, default: 0 },
    totalVariance: { type: Number, default: 0 },
    totalVariancePercentage: { type: Number, default: 0 },
    itemsWithVariance: { type: Number, default: 0 },
    unresolvedCount: { type: Number, default: 0 }
  },
  scheduledDate: { type: Date },
  startedAt: { type: Date },
  completedAt: { type: Date },
  approvedAt: { type: Date },
  counters: [{
    userId: { type: String, required: true },
    userName: { type: String },
    itemsCountedBy: { type: Number, default: 0 },
    countStartTime: { type: Date },
    countEndTime: { type: Date }
  }],
  supervisor: { type: String, trim: true },
  approvedBy: { type: String, trim: true },
  notes: { type: String, trim: true },
  photosUrl: [{ type: String }], // Photo evidence of count
  metadata: {
    temperature: { type: Number }, // Storage condition
    storageArea: { type: String },
    season: { type: String },
    businessCycle: { type: String },
    reorderLevel: { type: Boolean, default: false }
  },
  varianceThreshold: { type: Number, default: 2 }, // % - variance above this triggers investigation
  autoResolve: { type: Boolean, default: false } // Auto-resolve within threshold
}, {
  timestamps: true,
  collection: 'stock_reconciliations'
});

// Indexes
StockReconciliationSchema.index({ reconciliationId: 1 });
StockReconciliationSchema.index({ storeId: 1, createdAt: -1 });
StockReconciliationSchema.index({ status: 1, storeId: 1 });
StockReconciliationSchema.index({ type: 1, createdAt: -1 });
StockReconciliationSchema.index({ period: 1 });

// Methods
StockReconciliationSchema.methods.calculateVariances = function() {
  this.items.forEach(item => {
    if (item.countedQuantity !== undefined) {
      item.variance = item.countedQuantity - item.systemQuantity;
      item.variancePercentage = (item.variance / item.systemQuantity) * 100;
    }
  });
  
  this.updateSummary();
};

StockReconciliationSchema.methods.updateSummary = function() {
  const summary = {
    totalSkus: this.items.length,
    totalSystemValue: 0,
    totalCountedValue: 0,
    totalVariance: 0,
    totalVariancePercentage: 0,
    itemsWithVariance: 0,
    unresolvedCount: 0
  };
  
  this.items.forEach(item => {
    summary.totalSystemValue += item.systemQuantity;
    if (item.countedQuantity !== undefined) {
      summary.totalCountedValue += item.countedQuantity;
    }
    
    if (item.variance !== 0 && item.variance !== undefined) {
      summary.itemsWithVariance += 1;
      summary.totalVariance += Math.abs(item.variance);
    }
    
    if (!item.isResolved) {
      summary.unresolvedCount += 1;
    }
  });
  
  if (summary.totalSystemValue > 0) {
    summary.totalVariancePercentage = (summary.totalVariance / summary.totalSystemValue) * 100;
  }
  
  this.summary = summary;
};

StockReconciliationSchema.methods.resolveVariances = function() {
  let resolvedCount = 0;
  
  this.items.forEach(item => {
    if (!item.isResolved && item.variancePercentage !== undefined) {
      const absVariance = Math.abs(item.variancePercentage);
      
      if (absVariance <= this.varianceThreshold) {
        item.isResolved = true;
        item.resolutionAction = 'accept_system';
        resolvedCount += 1;
      }
    }
  });
  
  this.updateSummary();
  return resolvedCount;
};

StockReconciliationSchema.methods.isComplete = function() {
  return this.items.every(item => item.countedQuantity !== undefined && item.countedQuantity !== null);
};

StockReconciliationSchema.methods.canApprove = function() {
  return this.summary.unresolvedCount === 0 && this.isComplete();
};

StockReconciliationSchema.methods.startCounting = function(counterId, counterName) {
  if (this.status === 'scheduled') {
    this.status = 'in_progress';
    this.startedAt = new Date();
  }
  
  this.counters.push({
    userId: counterId,
    userName: counterName,
    countStartTime: new Date()
  });
};

StockReconciliationSchema.methods.completeCounting = function(counterId) {
  const counter = this.counters.find(c => c.userId === counterId);
  if (counter) {
    counter.countEndTime = new Date();
  }
  
  if (this.isComplete()) {
    this.status = 'counting_complete';
    this.completedAt = new Date();
  }
};

// Statics
StockReconciliationSchema.statics.createReconciliation = async function(data) {
  const reconciliationId = `REC_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  return this.create({
    reconciliationId,
    ...data
  });
};

StockReconciliationSchema.statics.getPendingReconciliations = function(storeId) {
  return this.find({
    storeId,
    status: { $in: ['scheduled', 'in_progress', 'counting_complete'] }
  }).sort({ period: 1 });
};

StockReconciliationSchema.statics.getReconciliationsByPeriod = function(storeId, startDate, endDate) {
  return this.find({
    storeId,
    'period.startDate': { $gte: startDate },
    'period.endDate': { $lte: endDate }
  }).sort({ createdAt: -1 });
};

module.exports = mongoose.models.StockReconciliation || mongoose.model('StockReconciliation', StockReconciliationSchema);
