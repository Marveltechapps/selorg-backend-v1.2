const mongoose = require('mongoose');
const { Schema } = mongoose;

const InventoryTransactionSchema = new Schema({
  transactionId: { type: String, required: true, unique: true, index: true },
  transactionType: {
    type: String,
    enum: [
      'purchase', 'sale', 'return', 'damage', 'adjustment', 
      'transfer', 'reservation', 'cancellation', 'expiry_removal',
      'stock_count', 'cycle_count', 'sample_usage'
    ],
    required: true,
    index: true
  },
  sku: { type: String, required: true, trim: true, index: true },
  quantity: { type: Number, required: true },
  quantityUnit: { type: String, default: 'piece' },
  storeId: { type: String, required: true, trim: true, index: true },
  warehouseId: { type: String, trim: true },
  sourceLocation: { type: String, trim: true },
  destinationLocation: { type: String, trim: true },
  referenceId: { type: String, trim: true, index: true }, // Order ID, Return ID, etc.
  referenceType: { type: String }, // 'order', 'return', 'transfer', etc.
  priceInfo: {
    unitCost: { type: Number, default: 0 },
    unitPrice: { type: Number, default: 0 },
    totalValue: { type: Number, default: 0 },
    currency: { type: String, default: 'USD' }
  },
  reason: { type: String, trim: true },
  notes: { type: String, trim: true },
  createdBy: { type: String, required: true, trim: true },
  approvedBy: { type: String, trim: true },
  approvalStatus: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'approved'
  },
  batchNumber: { type: String, trim: true }, // For expiry tracking
  expiryDate: { type: Date },
  physicalVerified: { type: Boolean, default: false },
  verifiedBy: { type: String, trim: true },
  verificationTimestamp: { type: Date },
  metadata: {
    deviceType: { type: String }, // 'mobile', 'web', 'api'
    geolocation: {
      latitude: { type: Number },
      longitude: { type: Number },
      timestamp: { type: Date }
    },
    invoiceNumber: { type: String },
    carrierInfo: Schema.Types.Mixed,
    customFields: Schema.Types.Mixed
  },
  balanceAfterTransaction: { type: Number }, // Stock level after this transaction
  balanceBeforeTransaction: { type: Number }, // Stock level before this transaction
  reconciliationStatus: {
    type: String,
    enum: ['unreconciled', 'reconciled', 'discrepancy'],
    default: 'unreconciled',
    index: true
  }
}, {
  timestamps: true,
  collection: 'inventory_transactions'
});

// Indexes for performance
InventoryTransactionSchema.index({ transactionId: 1 });
InventoryTransactionSchema.index({ sku: 1, storeId: 1, createdAt: -1 });
InventoryTransactionSchema.index({ storeId: 1, createdAt: -1 });
InventoryTransactionSchema.index({ transactionType: 1, createdAt: -1 });
InventoryTransactionSchema.index({ referenceId: 1 });
InventoryTransactionSchema.index({ createdAt: -1 }); // For audit logs
InventoryTransactionSchema.index({ reconciliationStatus: 1 });

// Compound index for common queries
InventoryTransactionSchema.index({ sku: 1, storeId: 1, transactionType: 1 });

// Methods
InventoryTransactionSchema.methods.getImpactOnStock = function() {
  const increasingTypes = ['purchase', 'return', 'sample_usage']; // Wait, sample usage decreases
  const decreasingTypes = ['sale', 'damage', 'expiry_removal', 'sample_usage'];
  
  if (decreasingTypes.includes(this.transactionType)) {
    return -this.quantity;
  } else if (increasingTypes.includes(this.transactionType)) {
    return this.quantity;
  } else if (this.transactionType === 'adjustment') {
    return this.quantity; // Can be positive or negative
  }
  return 0;
};

InventoryTransactionSchema.methods.isAuditableTransaction = function() {
  const auditableTypes = ['damage', 'expiry_removal', 'cycle_count', 'stock_count', 'adjustment'];
  return auditableTypes.includes(this.transactionType);
};

InventoryTransactionSchema.methods.requiresApproval = function() {
  const approvalRequiredTypes = ['damage', 'expiry_removal', 'adjustment', 'transfer'];
  return approvalRequiredTypes.includes(this.transactionType);
};

// Statics
InventoryTransactionSchema.statics.createTransaction = async function(data) {
  const transactionId = `TXN_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  return this.create({
    transactionId,
    ...data
  });
};

InventoryTransactionSchema.statics.getTransactionsByReference = function(referenceId) {
  return this.find({ referenceId }).sort({ createdAt: -1 });
};

InventoryTransactionSchema.statics.getStoreInventoryHistory = function(storeId, sku, daysBack = 30) {
  const startDate = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000);
  
  return this.find({
    storeId,
    sku,
    createdAt: { $gte: startDate }
  }).sort({ createdAt: -1 });
};

InventoryTransactionSchema.statics.getPendingApprovals = function() {
  return this.find({ 
    approvalStatus: 'pending',
    $expr: { $eq: ['$requiresApproval', true] }
  }).sort({ createdAt: 1 });
};

InventoryTransactionSchema.statics.getUnreconciledTransactions = function(storeId, startDate, endDate) {
  return this.find({
    storeId,
    reconciliationStatus: 'unreconciled',
    createdAt: { $gte: startDate, $lte: endDate }
  }).sort({ createdAt: 1 });
};

module.exports = mongoose.models.InventoryTransaction || mongoose.model('InventoryTransaction', InventoryTransactionSchema);
