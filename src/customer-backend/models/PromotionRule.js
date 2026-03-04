const mongoose = require('mongoose');

const scheduleSchema = new mongoose.Schema(
  {
    startDate: Date,
    endDate: Date,
  },
  { _id: false }
);

const promotionRuleSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    type: { type: String, enum: ['percentage', 'flat', 'bogo', 'free_delivery'], default: 'percentage' },
    targetType: { type: String, enum: ['product', 'collection', 'cart'], default: 'cart' },
    targetId: { type: mongoose.Schema.Types.ObjectId, refPath: 'targetModel', default: null },
    targetModel: { type: String, enum: ['CustomerProduct', 'CustomerCollection', null], default: null },
    discountValue: { type: Number, required: true, min: 0 },
    minCartValue: { type: Number, default: 0 },
    maxDiscountCap: { type: Number, default: null },
    autoApply: { type: Boolean, default: false },
    couponCode: { type: String, default: null, sparse: true },
    schedule: scheduleSchema,
    usageLimit: { type: Number, default: null },
    perUserLimit: { type: Number, default: null },
    usageCount: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

promotionRuleSchema.index({ isActive: 1, 'schedule.startDate': 1, 'schedule.endDate': 1 });
promotionRuleSchema.index({ couponCode: 1 }, { sparse: true });

const PromotionRule = mongoose.models.CustomerPromotionRule || mongoose.model('CustomerPromotionRule', promotionRuleSchema, 'customer_promotion_rules');
module.exports = { PromotionRule };
