const mongoose = require('mongoose');

const grnSchema = new mongoose.Schema(
  {
    grn_id: {
      type: String,
      required: true,
      unique: true,
    },
    truck_id: {
      type: String,
      required: true,
    },
    supplier: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      required: true,
      enum: ['pending', 'in_progress', 'completed', 'rejected'],
      default: 'pending',
    },
    store_id: {
      type: String,
      required: true,
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
    received_quantity: {
      type: Number,
      required: false,
      default: 0,
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

grnSchema.index({ grn_id: 1 });
grnSchema.index({ store_id: 1, status: 1 });
grnSchema.index({ truck_id: 1 });
grnSchema.index({ store_id: 1, created_at: -1 });

module.exports = mongoose.models.GRN || mongoose.model('GRN', grnSchema);

