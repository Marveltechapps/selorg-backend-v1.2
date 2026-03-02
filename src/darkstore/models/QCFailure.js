const mongoose = require('mongoose');

const qcFailureSchema = new mongoose.Schema(
  {
    failure_id: {
      type: String,
      required: true,
      unique: true,
    },
    order_id: {
      type: String,
      required: true,
    },
    product_name: {
      type: String,
      required: true,
    },
    sku: {
      type: String,
      required: true,
    },
    issue: {
      type: String,
      required: true,
    },
    severity: {
      type: String,
      required: true,
      enum: ['low', 'medium', 'high'],
    },
    detected_by: {
      type: String,
      required: true,
    },
    detected_at: {
      type: Date,
      required: true,
    },
    status: {
      type: String,
      required: true,
      default: 'pending',
    },
    resolution_notes: {
      type: String,
      required: false,
    },
    action_taken: {
      type: String,
      required: false,
    },
    store_id: {
      type: String,
      required: false,
    },
  },
  {
    timestamps: true,
  }
);

qcFailureSchema.index({ store_id: 1, status: 1 });
qcFailureSchema.index({ store_id: 1, severity: 1 });
qcFailureSchema.index({ order_id: 1 });

module.exports = mongoose.models.QCFailure || mongoose.model('QCFailure', qcFailureSchema);

