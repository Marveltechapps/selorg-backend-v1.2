const mongoose = require('mongoose');

const FinancialLimitSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    limitType: {
      type: String,
      enum: ['transaction', 'daily', 'weekly', 'monthly'],
      required: true,
    },
    entityType: {
      type: String,
      enum: ['customer', 'vendor', 'store'],
      required: true,
    },
    maxAmount: {
      type: Number,
      required: true,
      min: 0,
    },
    currentUsage: {
      type: Number,
      default: 0,
      min: 0,
    },
    resetDate: {
      type: Date,
    },
    alertThreshold: {
      type: Number,
      default: 80,
      min: 0,
      max: 100,
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

FinancialLimitSchema.index({ limitType: 1, entityType: 1 });
FinancialLimitSchema.index({ isActive: 1 });

module.exports = mongoose.models.FinancialLimit || mongoose.model('FinancialLimit', FinancialLimitSchema);
