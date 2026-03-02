const mongoose = require('mongoose');

const interStoreTransferSchema = new mongoose.Schema(
  {
    transfer_id: {
      type: String,
      required: true,
      unique: true,
    },
    from_store: {
      type: String,
      required: true,
    },
    to_store: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      required: true,
      enum: ['pending', 'in_transit', 'received', 'rejected'],
      default: 'pending',
    },
    items_count: {
      type: Number,
      required: true,
      default: 0,
    },
    total_quantity: {
      type: Number,
      required: true,
      default: 0,
    },
    requested_at: {
      type: String,
      required: true,
    },
    expected_arrival: {
      type: String,
      required: true,
    },
    actual_arrival: {
      type: String,
      required: false,
    },
    notes: {
      type: String,
      required: false,
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

interStoreTransferSchema.index({ transfer_id: 1 });
interStoreTransferSchema.index({ to_store: 1, status: 1 });
interStoreTransferSchema.index({ from_store: 1, status: 1 });

module.exports = mongoose.models.InterStoreTransfer || mongoose.model('InterStoreTransfer', interStoreTransferSchema);

