const mongoose = require('mongoose');

const inventoryAdjustmentSchema = new mongoose.Schema(
  {
    id: {
      type: String,
      required: true,
      unique: true,
    },
    time: {
      type: String,
      required: true,
    },
    sku: {
      type: String,
      required: true,
    },
    action: {
      type: String,
      required: true,
      enum: ['add', 'remove', 'adjust', 'damage'],
    },
    quantity: {
      type: Number,
      required: true,
    },
    user: {
      type: String,
      required: true,
    },
    reason: {
      type: String,
      required: true,
    },
    store_id: {
      type: String,
      required: true,
    },
    mode: {
      type: String,
      required: false,
      enum: ['add', 'remove', 'damage'],
    },
    reason_code: {
      type: String,
      required: false,
    },
    notes: {
      type: String,
      required: false,
    },
    adjustment_id: {
      type: String,
      required: false,
    },
    new_stock: {
      type: Number,
      required: false,
    },
  },
  {
    timestamps: true,
  }
);

inventoryAdjustmentSchema.index({ store_id: 1, createdAt: -1 });
inventoryAdjustmentSchema.index({ sku: 1 });
inventoryAdjustmentSchema.index({ action: 1 });
inventoryAdjustmentSchema.index({ user: 1 });

module.exports = mongoose.models.InventoryAdjustment || mongoose.model('InventoryAdjustment', inventoryAdjustmentSchema);

