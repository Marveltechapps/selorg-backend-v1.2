const mongoose = require('mongoose');

const restockSchema = new mongoose.Schema(
  {
    restock_id: {
      type: String,
      required: true,
      unique: true,
      match: /^RST-\d+$/,
    },
    store_id: {
      type: String,
      required: true,
    },
    sku: {
      type: String,
      required: true,
      match: /^[A-Z0-9]+$/,
    },
    quantity: {
      type: Number,
      required: true,
      min: 1,
    },
    priority: {
      type: String,
      required: true,
      enum: ['low', 'normal', 'high', 'urgent'],
      default: 'normal',
    },
    status: {
      type: String,
      enum: ['pending', 'ordered', 'in_transit', 'delivered', 'cancelled'],
      default: 'pending',
    },
    estimated_arrival: {
      type: Date,
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
restockSchema.index({ store_id: 1, status: 1 });
restockSchema.index({ restock_id: 1 });
restockSchema.index({ sku: 1 });

module.exports = mongoose.models.Restock || mongoose.model('Restock', restockSchema);

