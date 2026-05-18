const mongoose = require('mongoose');

const pricingRuleSchema = new mongoose.Schema({
  ruleId: {
    type: String,
    required: true,
    unique: true,
  },
  ruleName: {
    type: String,
    required: true,
  },
  priority: {
    type: Number,
    required: true,
    description: '1=highest priority',
  },
  pricingStrategy: {
    type: String,
    enum: ['FIXED', 'PERCENTAGE', 'DYNAMIC', 'MARGIN_BASED', 'COST_PLUS'],
    required: true,
  },
  applicableSKUs: [String],
  applicableSegments: [mongoose.Schema.Types.ObjectId],
  basePrice: Number,
  minPrice: Number,
  maxPrice: Number,
  marginTarget: Number,
  adjustmentRules: [{
    condition: String,
    adjustmentType: String,
    adjustmentValue: Number,
  }],
  timeRange: {
    startDate: Date,
    endDate: Date,
  },
  isActive: {
    type: Boolean,
    default: true,
  },
  createdBy: mongoose.Schema.Types.ObjectId,
  approvedBy: mongoose.Schema.Types.ObjectId,
  approvedAt: Date,
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
}, { collection: 'pricing_rules' });

pricingRuleSchema.index({ priority: 1 });
pricingRuleSchema.index({ ruleId: 1 });
pricingRuleSchema.index({ applicableSKUs: 1 });

module.exports = mongoose.model('PricingRule', pricingRuleSchema);
