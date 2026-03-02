const mongoose = require('mongoose');

const transferItemSchema = new mongoose.Schema(
  {
    transfer_id: {
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
    quantity: {
      type: Number,
      required: true,
    },
    received_quantity: {
      type: Number,
      required: false,
      default: 0,
    },
    status: {
      type: String,
      required: true,
      enum: ['pending', 'received', 'completed'],
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

transferItemSchema.index({ transfer_id: 1, sku: 1 });
transferItemSchema.index({ transfer_id: 1 });

module.exports = mongoose.models.TransferItem || mongoose.model('TransferItem', transferItemSchema);

