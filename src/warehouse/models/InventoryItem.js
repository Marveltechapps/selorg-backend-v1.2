const mongoose = require('mongoose');

const InventoryItemSchema = new mongoose.Schema({
  id: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  sku: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    index: true,
  },
  productName: {
    type: String,
    required: true,
    maxlength: 200,
    trim: true,
    index: true,
  },
  category: {
    type: String,
    required: true,
    trim: true,
    index: true,
  },
  currentStock: {
    type: Number,
    required: true,
    min: 0,
    default: 0,
  },
  minStock: {
    type: Number,
    required: true,
    min: 0,
    default: 0,
  },
  maxStock: {
    type: Number,
    required: true,
    min: 1,
    default: 1000,
  },
  location: {
    type: String,
    required: true,
    trim: true,
    index: true,
  },
  value: {
    type: Number,
    required: true,
    min: 0,
    default: 0,
  },
  lastUpdated: {
    type: Date,
    default: Date.now,
    index: true,
  },
}, {
  timestamps: true,
  collection: 'inventory_items',
});

// Validation: currentStock cannot exceed maxStock
InventoryItemSchema.pre('save', function(next) {
  if (this.currentStock > this.maxStock) {
    return next(new Error('Current stock cannot exceed max stock'));
  }
  next();
});

// Indexes for performance
InventoryItemSchema.index({ category: 1, currentStock: 1 });
InventoryItemSchema.index({ sku: 'text', productName: 'text' });
InventoryItemSchema.index({ location: 1 });

module.exports = mongoose.models.InventoryItem || mongoose.model('InventoryItem', InventoryItemSchema);

