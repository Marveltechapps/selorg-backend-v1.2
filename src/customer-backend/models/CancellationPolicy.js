const mongoose = require('mongoose');

const cancellationPolicySchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    isActive: { type: Boolean, default: true },
    allowedStatuses: [{
      type: String,
      enum: ['pending', 'confirmed', 'getting-packed'],
    }],
    freeWindowMinutes: { type: Number, default: 2 },
    cancellationFeePercent: { type: Number, default: 0 },
    maxCancellationFee: { type: Number, default: 0 },
    maxCancellationsPerDay: { type: Number, default: 3 },
    maxCancellationsPerWeek: { type: Number, default: 10 },
    customerCanCancel: { type: Boolean, default: true },
    supportCanCancel: { type: Boolean, default: true },
    autoRefundOnCancel: { type: Boolean, default: true },
    refundMethod: {
      type: String,
      enum: ['original_payment', 'wallet', 'manual'],
      default: 'original_payment',
    },
    appliesTo: {
      type: String,
      enum: ['all', 'cod', 'online', 'wallet'],
      default: 'all',
    },
  },
  { timestamps: true }
);

const CancellationPolicy =
  mongoose.models.CancellationPolicy ||
  mongoose.model('CancellationPolicy', cancellationPolicySchema);

module.exports = { CancellationPolicy };
