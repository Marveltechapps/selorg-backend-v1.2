/**
 * Admin Pricing Coupon model - uses customer_coupons collection.
 * Extends customer checkout coupon schema with admin fields.
 * Field mapping for checkout: status active -> isActive, startDate -> validFrom, endDate -> validTo,
 * minOrderValue -> minOrderAmount, maxDiscount -> maxDiscountAmount, discountType percent -> percent, flat -> fixed.
 */
const mongoose = require('mongoose');
const { Schema } = mongoose;

const couponSchema = new Schema(
  {
    code: { type: String, required: true, unique: true, uppercase: true },
    name: { type: String, required: true, default: '' },
    description: { type: String, default: '' },
    discountType: {
      type: String,
      required: true,
      enum: ['percentage', 'flat', 'free_delivery', 'percent', 'fixed', 'FLAT_DISCOUNT', 'PERCENTAGE', 'FREE_DELIVERY', 'BOGO', 'CASHBACK', 'TIERED_FLAT'],
      default: 'percentage',
    },
    discountValue: { type: Number, required: true, min: 0 },
    minOrderValue: { type: Number, default: 0 },
    minOrderAmount: { type: Number, default: 0 },
    maxDiscount: { type: Number, default: null },
    maxDiscountAmount: { type: Number, default: null },
    discountOn: {
      type: String,
      enum: ['CART_TOTAL', 'DELIVERY_FEE', 'CATEGORY', 'SPECIFIC_SKU'],
      default: 'CART_TOTAL',
    },
    applicableCategories: [{ type: String }],
    applicableProducts: [{ type: String }],
    applicableSkuIds: [{ type: String }],
    tiers: [
      {
        minOrder: { type: Number },
        discountAmount: { type: Number },
      },
    ],
    bogoMinQty: { type: Number, default: 2 },
    usageLimit: { type: Number, default: null },
    usagePerUser: { type: Number, default: 1 },
    usageCount: { type: Number, default: 0 },
    isFirstOrderOnly: { type: Boolean, default: false },
    isStackable: { type: Boolean, default: false },
    excludeSaleItems: { type: Boolean, default: true },
    validDays: [{ type: String }],
    validTimeSlots: [
      {
        from: { type: String },
        to: { type: String },
      },
    ],
    userSegments: [{ type: String }],
    targetSegment: {
      type: String,
      enum: ['ALL_USERS', 'NEW_USERS', 'LAPSED_7D', 'LAPSED_30D', 'VIP_TIER', 'SPECIFIC_USER_IDS'],
      default: 'ALL_USERS',
    },
    targetUserIds: [{ type: String }],
    targetZones: [{ type: String }],
    paymentRestriction: {
      type: String,
      enum: ['ALL', 'UPI', 'COD', 'WALLET'],
      default: 'ALL',
    },
    showInSections: [{ type: String, default: ['COUPON_LIST'] }],
    priorityRank: { type: Number, default: 10 },
    bannerImageUrl: { type: String },
    themeColor: { type: String, default: '#2A7D4F' },
    deepLink: { type: String },
    termsAndConditions: { type: String },
    cashbackCreditTrigger: {
      type: String,
      enum: ['ORDER_DELIVERED', 'ORDER_PLACED'],
      default: 'ORDER_DELIVERED',
    },
    cashbackExpiryDays: { type: Number, default: 14 },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    validFrom: { type: Date, default: null },
    validTo: { type: Date, default: null },
    status: {
      type: String,
      required: true,
      enum: ['active', 'paused', 'expired'],
      default: 'active',
    },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true, collection: 'customer_coupons' }
);

couponSchema.index({ code: 1 });
couponSchema.index({ status: 1, startDate: 1, endDate: 1 });
couponSchema.index({ isActive: 1 });

const PricingCoupon =
  mongoose.models.PricingCoupon || mongoose.model('PricingCoupon', couponSchema);

module.exports = { PricingCoupon };
