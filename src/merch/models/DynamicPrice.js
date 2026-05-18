const mongoose = require('mongoose');

const dynamicPriceSchema = new mongoose.Schema({
  priceId: {
    type: String,
    required: true,
    unique: true,
  },
  sku: {
    type: String,
    required: true,
  },
  basePrice: {
    type: Number,
    required: true,
  },
  currentPrice: {
    type: Number,
    required: true,
  },
  priceHistory: [{
    price: Number,
    appliedDate: Date,
    reason: String,
    ruleApplied: String,
  }],
  pricingFactors: {
    demandLevel: { type: String, enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] },
    inventoryLevel: Number,
    competitorPrice: Number,
    elasticity: Number,
    marginPercentage: Number,
  },
  lastCalculatedAt: Date,
  nextReviewDate: Date,
  isOptimized: {
    type: Boolean,
    default: false,
  },
  optimizationScore: Number,
  regionSpecific: [{
    region: String,
    adjustedPrice: Number,
  }],
  customerSegmentPrices: [{
    segmentId: mongoose.Schema.Types.ObjectId,
    segmentName: String,
    price: Number,
  }],
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
}, { collection: 'dynamic_prices' });

dynamicPriceSchema.index({ sku: 1 });
dynamicPriceSchema.index({ priceId: 1 });
dynamicPriceSchema.index({ lastCalculatedAt: -1 });

module.exports = mongoose.model('DynamicPrice', dynamicPriceSchema);
