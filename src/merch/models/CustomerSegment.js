const mongoose = require('mongoose');

const customerSegmentSchema = new mongoose.Schema({
  segmentId: {
    type: String,
    required: true,
    unique: true,
  },
  segmentName: {
    type: String,
    required: true,
  },
  description: String,
  segmentationType: {
    type: String,
    enum: ['DEMOGRAPHIC', 'BEHAVIORAL', 'PURCHASE_VALUE', 'FREQUENCY', 'LOYALTY'],
    required: true,
  },
  criteria: {
    ageRange: { min: Number, max: Number },
    location: [String],
    purchaseFrequency: { min: Number, max: Number },
    averageOrderValue: { min: Number, max: Number },
    loyaltyTier: String,
    productCategory: [String],
  },
  customerCount: Number,
  estimatedValue: Number,
  segmentPricing: {
    discountPercentage: Number,
    priceMultiplier: Number,
    specialOffers: [String],
  },
  targetCampaigns: [mongoose.Schema.Types.ObjectId],
  performance: {
    conversionRate: Number,
    averageOrderValue: Number,
    repeatPurchaseRate: Number,
    churnRate: Number,
  },
  isActive: {
    type: Boolean,
    default: true,
  },
  createdBy: mongoose.Schema.Types.ObjectId,
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
}, { collection: 'customer_segments' });

customerSegmentSchema.index({ segmentId: 1 });
customerSegmentSchema.index({ segmentationType: 1 });

module.exports = mongoose.model('CustomerSegment', customerSegmentSchema);
