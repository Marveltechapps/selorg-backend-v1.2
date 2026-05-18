const mongoose = require('mongoose');

const promotionCampaignSchema = new mongoose.Schema({
  campaignId: {
    type: String,
    required: true,
    unique: true,
  },
  campaignName: {
    type: String,
    required: true,
  },
  description: String,
  campaignType: {
    type: String,
    enum: ['DISCOUNT', 'BOGO', 'BUNDLE', 'LOYALTY', 'FLASH_SALE', 'SEASONAL'],
    required: true,
  },
  status: {
    type: String,
    enum: ['DRAFT', 'SCHEDULED', 'ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELLED'],
    default: 'DRAFT',
  },
  timeline: {
    startDate: {
      type: Date,
      required: true,
    },
    endDate: {
      type: Date,
      required: true,
    },
    launchDate: Date,
    completionDate: Date,
  },
  applicableProducts: [{
    sku: String,
    category: String,
  }],
  targetSegments: [mongoose.Schema.Types.ObjectId],
  discountRules: [{
    ruleId: String,
    discountType: { type: String, enum: ['PERCENTAGE', 'FIXED', 'BOGO', 'TIERED'] },
    discountValue: Number,
    minQuantity: Number,
    maxQuantity: Number,
    condition: String,
  }],
  budget: {
    totalBudget: Number,
    allocatedBudget: Number,
    spentBudget: { type: Number, default: 0 },
    remainingBudget: Number,
  },
  expectedMetrics: {
    expectedSalesLift: Number,
    expectedUnits: Number,
    expectedRevenue: Number,
  },
  actualMetrics: {
    actualSalesLift: Number,
    actualUnits: { type: Number, default: 0 },
    actualRevenue: { type: Number, default: 0 },
    roi: Number,
  },
  channels: [{ type: String, enum: ['ONLINE', 'OFFLINE', 'MOBILE', 'EMAIL', 'SOCIAL'] }],
  priority: {
    type: String,
    enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'],
    default: 'MEDIUM',
  },
  approvals: [{
    approver: mongoose.Schema.Types.ObjectId,
    approvalDate: Date,
    comments: String,
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
}, { collection: 'promotion_campaigns' });

promotionCampaignSchema.index({ campaignId: 1 });
promotionCampaignSchema.index({ status: 1 });
promotionCampaignSchema.index({ 'timeline.startDate': 1 });

module.exports = mongoose.model('PromotionCampaign', promotionCampaignSchema);
