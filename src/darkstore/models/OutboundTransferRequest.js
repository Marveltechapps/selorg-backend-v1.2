const mongoose = require('mongoose');

const outboundTransferRequestSchema = new mongoose.Schema(
  {
    request_id: {
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
    items_count: {
      type: Number,
      required: true,
      default: 0,
    },
    priority: {
      type: String,
      required: true,
      enum: ['Critical', 'High', 'Normal'],
      default: 'Normal',
    },
    sla_remaining: {
      type: String,
      required: false,
    },
    status: {
      type: String,
      required: true,
      enum: ['pending', 'approved', 'rejected', 'in_progress', 'completed'],
      default: 'pending',
    },
    requested_at: {
      type: String,
      required: true,
    },
    expected_dispatch: {
      type: String,
      required: false,
    },
    notes: {
      type: String,
      required: false,
    },
    reason: {
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

outboundTransferRequestSchema.index({ request_id: 1 });
outboundTransferRequestSchema.index({ from_store: 1, status: 1 });
outboundTransferRequestSchema.index({ to_store: 1, status: 1 });

module.exports = mongoose.models.OutboundTransferRequest || mongoose.model('OutboundTransferRequest', outboundTransferRequestSchema);

