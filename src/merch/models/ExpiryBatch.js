const mongoose = require('mongoose');
const { Schema } = mongoose;

const ExpiryBatchSchema = new Schema({
  batchId: { type: String, required: true, unique: true, index: true },
  storeId: { type: String, required: true, trim: true, index: true },
  sku: { type: String, required: true, trim: true, index: true },
  productName: { type: String, trim: true },
  quantity: { type: Number, required: true },
  quantityUnit: { type: String, default: 'piece' },
  batchNumber: { type: String, required: true, trim: true },
  manufacturingDate: { type: Date },
  expiryDate: { type: Date, required: true, index: true },
  receivedDate: { type: Date },
  cost: { type: Number },
  location: { type: String, trim: true }, // Shelf location
  status: {
    type: String,
    enum: ['active', 'expiring_soon', 'expired', 'marked_for_removal', 'removed', 'sold'],
    default: 'active',
    index: true
  },
  expiryStatus: {
    daysUntilExpiry: { type: Number },
    isExpired: { type: Boolean, default: false },
    lastCheckedAt: { type: Date },
    alertsSent: { type: Number, default: 0 },
    lastAlertAt: { type: Date }
  },
  removal: {
    scheduledRemovalDate: { type: Date },
    actualRemovalDate: { type: Date },
    removalReason: {
      type: String,
      enum: ['expiry', 'damage', 'quality_issue', 'recall', 'customer_return'],
      default: 'expiry'
    },
    removalApprovedBy: { type: String, trim: true },
    removalApprovedAt: { type: Date },
    quantityRemoved: { type: Number },
    wasteAmount: { type: Number }, // Cost of wasted product
    notes: { type: String, trim: true }
  },
  sales: {
    soldQuantity: { type: Number, default: 0 },
    soldAt: { type: Date },
    discountApplied: { type: Boolean, default: false },
    discountPercent: { type: Number, default: 0 },
    remarks: { type: String, trim: true }
  },
  alerts: [{
    alertType: { type: String, enum: ['30_days', '14_days', '7_days', 'expired', 'removed'] },
    triggeredAt: { type: Date, default: Date.now },
    notifiedTo: [{ type: String }], // User emails
    acknowledged: { type: Boolean, default: false }
  }],
  metadata: {
    supplier: { type: String, trim: true },
    storageCondition: { type: String }, // e.g., 'refrigerated', 'ambient'
    temperature: { type: Number }, // Storage temperature
    humidity: { type: Number }, // Storage humidity %
    inspectionNotes: { type: String, trim: true },
    createdBy: { type: String, required: true, trim: true },
    lastUpdatedBy: { type: String, trim: true }
  }
}, {
  timestamps: true,
  collection: 'expiry_batches'
});

// Indexes
ExpiryBatchSchema.index({ batchId: 1 });
ExpiryBatchSchema.index({ storeId: 1, expiryDate: 1 });
ExpiryBatchSchema.index({ sku: 1, storeId: 1, status: 1 });
ExpiryBatchSchema.index({ status: 1, expiryDate: 1 });
ExpiryBatchSchema.index({ expiryDate: 1 }); // For cleanup jobs

// Methods
ExpiryBatchSchema.methods.calculateDaysToExpiry = function() {
  const today = new Date();
  const diffTime = this.expiryDate - today;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  this.expiryStatus.daysUntilExpiry = diffDays;
  return diffDays;
};

ExpiryBatchSchema.methods.checkExpiryStatus = function() {
  const daysToExpiry = this.calculateDaysToExpiry();
  this.expiryStatus.lastCheckedAt = new Date();

  if (daysToExpiry < 0) {
    this.expiryStatus.isExpired = true;
    this.status = 'expired';
  } else if (daysToExpiry <= 7 && this.status === 'active') {
    this.status = 'expiring_soon';
  }

  return daysToExpiry;
};

ExpiryBatchSchema.methods.sendExpiryAlert = function(daysThreshold) {
  const daysToExpiry = this.calculateDaysToExpiry();

  if (daysToExpiry <= daysThreshold && daysToExpiry > 0) {
    this.alerts.push({
      alertType: `${daysThreshold}_days`,
      triggeredAt: new Date()
    });

    this.expiryStatus.alertsSent += 1;
    this.expiryStatus.lastAlertAt = new Date();

    return true;
  }

  return false;
};

ExpiryBatchSchema.methods.markForRemoval = function(approvedBy, notes = '') {
  this.status = 'marked_for_removal';
  this.removal.removalApprovedBy = approvedBy;
  this.removal.removalApprovedAt = new Date();
  this.removal.scheduledRemovalDate = this.expiryDate;
  if (notes) {
    this.removal.notes = notes;
  }
};

ExpiryBatchSchema.methods.recordRemoval = function(quantityRemoved, notes = '') {
  this.status = 'removed';
  this.removal.actualRemovalDate = new Date();
  this.removal.quantityRemoved = quantityRemoved || this.quantity;
  this.removal.wasteAmount = (this.removal.quantityRemoved / this.quantity) * (this.cost || 0);

  if (notes) {
    this.removal.notes = notes;
  }
};

ExpiryBatchSchema.methods.recordSale = function(soldQuantity, discountPercent = 0) {
  this.sales.soldQuantity = soldQuantity;
  this.sales.soldAt = new Date();
  
  if (discountPercent > 0) {
    this.sales.discountApplied = true;
    this.sales.discountPercent = discountPercent;
  }

  const remaining = this.quantity - soldQuantity;
  if (remaining <= 0) {
    this.status = 'sold';
  }
};

ExpiryBatchSchema.statics.createBatch = async function(data) {
  const batchId = `BATCH_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  const batch = new this({
    batchId,
    ...data
  });

  batch.checkExpiryStatus();
  await batch.save();

  return batch;
};

ExpiryBatchSchema.statics.getExpiringBatches = function(storeId, daysThreshold = 30) {
  const futureDate = new Date(Date.now() + daysThreshold * 24 * 60 * 60 * 1000);

  return this.find({
    storeId,
    expiryDate: { $lte: futureDate },
    status: { $in: ['active', 'expiring_soon'] }
  }).sort({ expiryDate: 1 });
};

ExpiryBatchSchema.statics.getExpiredBatches = function(storeId) {
  return this.find({
    storeId,
    status: { $in: ['expired', 'marked_for_removal'] }
  }).sort({ expiryDate: 1 });
};

ExpiryBatchSchema.statics.getTotalWaste = function(storeId, startDate, endDate) {
  return this.aggregate([
    {
      $match: {
        storeId,
        'removal.actualRemovalDate': { $gte: startDate, $lte: endDate }
      }
    },
    {
      $group: {
        _id: '$storeId',
        totalWaste: { $sum: '$removal.wasteAmount' },
        batchesRemoved: { $sum: 1 },
        itemsRemoved: { $sum: '$removal.quantityRemoved' }
      }
    }
  ]);
};

module.exports = mongoose.models.ExpiryBatch || mongoose.model('ExpiryBatch', ExpiryBatchSchema);
