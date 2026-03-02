const mongoose = require('mongoose');

const packingOrderItemSchema = new mongoose.Schema(
  {
    sku: {
      type: String,
      required: true,
    },
    name: {
      type: String,
      required: false,
    },
    quantity: {
      type: Number,
      required: true,
      min: 1,
    },
    weight: {
      type: String,
      required: false,
    },
    status: {
      type: String,
      required: false,
      enum: ['pending', 'scanned', 'missing', 'damaged'],
      default: 'pending',
    },
    order_id: {
      type: String,
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

packingOrderItemSchema.index({ order_id: 1 });
packingOrderItemSchema.index({ sku: 1, order_id: 1 });

module.exports = mongoose.models.PackingOrderItem || mongoose.model('PackingOrderItem', packingOrderItemSchema);

