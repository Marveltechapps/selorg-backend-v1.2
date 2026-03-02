const mongoose = require('mongoose');

const InventoryAdjustmentSchema = new mongoose.Schema({
  id: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  type: {
    type: String,
    required: true,
    enum: ['Damage Write-off', 'Cycle Count Adj.', 'Expiry Removal', 'Manual Adjustment', 'Found Items', 'Manual Correction'],
    index: true,
  },
  sku: {
    type: String,
    required: true,
    trim: true,
    index: true,
  },
  productName: {
    type: String,
    required: true,
    maxlength: 200,
    trim: true,
  },
  change: {
    type: Number,
    required: true,
    description: 'Quantity change (positive or negative)',
  },
  reason: {
    type: String,
    required: true,
    maxlength: 500,
    trim: true,
  },
  user: {
    type: String,
    required: true,
    trim: true,
    index: true,
  },
  timestamp: {
    type: Date,
    default: Date.now,
    index: true,
  },
}, {
  timestamps: true,
  collection: 'inventory_adjustments',
});

// Indexes for performance
InventoryAdjustmentSchema.index({ sku: 1, timestamp: -1 });
InventoryAdjustmentSchema.index({ type: 1, timestamp: -1 });
InventoryAdjustmentSchema.index({ user: 1, timestamp: -1 });


module.exports = mongoose.models.InventoryAdjustment || mongoose.model('InventoryAdjustment', InventoryAdjustmentSchema);

