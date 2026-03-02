const mongoose = require('mongoose');

const stockAlertSchema = new mongoose.Schema(
  {
    store_id: {
      type: String,
      required: true,
    },
    item_name: {
      type: String,
      required: true,
    },
    sku: {
      type: String,
      required: true,
      match: /^[A-Z0-9]+$/,
    },
    current_count: {
      type: Number,
      required: true,
      min: 0,
    },
    threshold: {
      type: Number,
      required: true,
      min: 0,
    },
    severity: {
      type: String,
      required: true,
      enum: ['critical', 'warning', 'low'],
      default: 'warning',
    },
    is_restocked: {
      type: Boolean,
      default: false,
    },
    restock_id: {
      type: String,
      required: false,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
stockAlertSchema.index({ store_id: 1, severity: 1 });
stockAlertSchema.index({ sku: 1 });

module.exports = mongoose.models.StockAlert || mongoose.model('StockAlert', stockAlertSchema);

