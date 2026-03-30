const mongoose = require('mongoose');

const StockAlertSchema = new mongoose.Schema({
  warehouseKey: { type: String, trim: true, index: true },
  id: {
    type: String,
    required: true,
    index: true,
  },
  type: {
    type: String,
    required: true,
    enum: ['low-stock', 'overstock', 'expiring', 'out-of-stock'],
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
  currentLevel: {
    type: Number,
    required: true,
    min: 0,
  },
  threshold: {
    type: Number,
    required: true,
    min: 0,
  },
  priority: {
    type: String,
    required: true,
    enum: ['high', 'medium', 'low'],
    default: 'medium',
    index: true,
  },
  location: {
    type: String,
    default: null,
    trim: true,
  },
  lastUpdated: {
    type: Date,
    default: Date.now,
    index: true,
  },
}, {
  timestamps: true,
  collection: 'stock_alerts',
});

StockAlertSchema.index({ warehouseKey: 1, id: 1 }, { unique: true });

// Indexes for performance
StockAlertSchema.index({ type: 1, priority: 1 });
StockAlertSchema.index({ sku: 1, type: 1 });
StockAlertSchema.index({ priority: 1, lastUpdated: -1 });


module.exports = mongoose.models.StockAlert || mongoose.model('StockAlert', StockAlertSchema);

