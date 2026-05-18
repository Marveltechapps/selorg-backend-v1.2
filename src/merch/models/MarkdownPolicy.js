const mongoose = require('mongoose');

const markdownPolicySchema = new mongoose.Schema({
  markdownId: {
    type: String,
    required: true,
    unique: true,
  },
  policyName: {
    type: String,
    required: true,
  },
  skus: [String],
  categories: [String],
  markdownReason: {
    type: String,
    enum: ['OVERSTOCK', 'SLOW_MOVING', 'SEASONAL', 'OBSOLETE', 'DAMAGE', 'CLEARANCE'],
    required: true,
  },
  originalPrice: Number,
  markdownSchedule: [{
    week: Number,
    discountPercentage: Number,
    targetPrice: Number,
  }],
  status: {
    type: String,
    enum: ['ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELLED'],
    default: 'ACTIVE',
  },
  timeline: {
    startDate: Date,
    endDate: Date,
    projectedClearanceDate: Date,
  },
  targets: {
    targetClearancePercentage: Number,
    targetRevenueRecovery: Number,
    maxAllowedLoss: Number,
  },
  performance: {
    unitsSold: { type: Number, default: 0 },
    revenueGenerated: { type: Number, default: 0 },
    actualClearancePercentage: Number,
    lossAmount: Number,
  },
  approvals: [{
    approver: mongoose.Schema.Types.ObjectId,
    approvalDate: Date,
  }],
  createdBy: mongoose.Schema.Types.ObjectId,
  approvedBy: mongoose.Schema.Types.ObjectId,
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
}, { collection: 'markdown_policies' });

markdownPolicySchema.index({ markdownId: 1 });
markdownPolicySchema.index({ status: 1 });
markdownPolicySchema.index({ skus: 1 });

module.exports = mongoose.model('MarkdownPolicy', markdownPolicySchema);
