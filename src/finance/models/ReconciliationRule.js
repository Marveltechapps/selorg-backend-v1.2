const mongoose = require('mongoose');

const ReconciliationRuleSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    type: {
      type: String,
      enum: ['order', 'payment', 'refund', 'payout'],
      required: true,
    },
    autoReconcile: {
      type: Boolean,
      default: false,
    },
    toleranceAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
    tolerancePercentage: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },
    frequency: {
      type: String,
      enum: ['realtime', 'hourly', 'daily'],
      default: 'daily',
    },
    notifyOnMismatch: {
      type: Boolean,
      default: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

ReconciliationRuleSchema.index({ type: 1 });
ReconciliationRuleSchema.index({ isActive: 1 });

module.exports = mongoose.models.ReconciliationRule || mongoose.model('ReconciliationRule', ReconciliationRuleSchema);
