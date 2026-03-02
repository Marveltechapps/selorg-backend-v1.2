const mongoose = require('mongoose');

const RefundPolicySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
    },
    orderType: {
      type: String,
      enum: ['all', 'prepaid', 'cod'],
      default: 'all',
    },
    autoApproveThreshold: {
      type: Number,
      default: 0,
    },
    processingTime: {
      type: Number,
      default: 7,
    },
    refundMethod: {
      type: String,
      enum: ['original', 'wallet', 'both'],
      default: 'original',
    },
    requiresManagerApproval: {
      type: Boolean,
      default: false,
    },
    managerApprovalThreshold: {
      type: Number,
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

module.exports = mongoose.models.RefundPolicy || mongoose.model('RefundPolicy', RefundPolicySchema);

