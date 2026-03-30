const mongoose = require('mongoose');

const couponSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true, uppercase: true },
    description: { type: String, default: '' },
    discountType: { type: String, enum: ['percent', 'fixed', 'percentage', 'flat', 'free_delivery', 'FLAT_DISCOUNT', 'PERCENTAGE', 'FREE_DELIVERY', 'BOGO', 'CASHBACK', 'TIERED_FLAT'], default: 'percent' },
    discountValue: { type: Number, required: true, min: 0 },
    minOrderAmount: { type: Number, default: 0 },
    maxDiscountAmount: { type: Number, default: null },
    discountOn: { type: String, default: 'CART_TOTAL' },
    applicableCategories: [{ type: String }],
    applicableSkuIds: [{ type: String }],
    tiers: { type: Array, default: [] },
    bogoMinQty: { type: Number, default: 2 },
    usageLimit: { type: Number, default: null },
    usageCount: { type: Number, default: 0 },
    isFirstOrderOnly: { type: Boolean, default: false },
    isStackable: { type: Boolean, default: false },
    excludeSaleItems: { type: Boolean, default: true },
    validDays: [{ type: String }],
    validTimeSlots: { type: Array, default: [] },
    targetSegment: { type: String, default: 'ALL_USERS' },
    targetUserIds: [{ type: String }],
    targetZones: [{ type: String }],
    paymentRestriction: { type: String, default: 'ALL' },
    showInSections: [{ type: String, default: ['COUPON_LIST'] }],
    priorityRank: { type: Number, default: 10 },
    bannerImageUrl: { type: String },
    themeColor: { type: String, default: '#2A7D4F' },
    deepLink: { type: String },
    termsAndConditions: { type: String },
    cashbackCreditTrigger: { type: String, default: 'ORDER_DELIVERED' },
    cashbackExpiryDays: { type: Number, default: 14 },
    validFrom: { type: Date, default: null },
    validTo: { type: Date, default: null },
  },
  { timestamps: true }
);

couponSchema.index({ code: 1, isActive: 1 });
couponSchema.index({ validFrom: 1, validTo: 1 });

const Coupon =
  mongoose.models.CustomerCoupon ||
  mongoose.model('CustomerCoupon', couponSchema, 'customer_coupons');

module.exports = { Coupon };
