const mongoose = require('mongoose');

const grnItemSchema = new mongoose.Schema(
  {
    grn_id: {
      type: String,
      required: true,
    },
    sku: {
      type: String,
      required: true,
    },
    product_name: {
      type: String,
      required: true,
    },
    expected_quantity: {
      type: Number,
      required: true,
    },
    received_quantity: {
      type: Number,
      required: false,
      default: 0,
    },
    damaged_quantity: {
      type: Number,
      required: false,
      default: 0,
    },
    status: {
      type: String,
      required: true,
      enum: ['pending', 'received', 'damaged', 'completed'],
      default: 'pending',
    },
    created_at: {
      type: String,
      required: true,
    },
    updated_at: {
      type: String,
      required: true,
    },
  },
  {
    timestamps: false,
  }
);

grnItemSchema.index({ grn_id: 1, sku: 1 });
grnItemSchema.index({ grn_id: 1 });

module.exports = mongoose.models.GRNItem || mongoose.model('GRNItem', grnItemSchema);

