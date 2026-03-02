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
      enum: ['percentage', 'flat', 'free_delivery', 'percent', 'fixed'],
      default: 'percentage',
    },
    discountValue: { type: Number, required: true, min: 0 },
    minOrderValue: { type: Number, default: 0 },
    minOrderAmount: { type: Number, default: 0 },
    maxDiscount: { type: Number, default: null },
    maxDiscountAmount: { type: Number, default: null },
    usageLimit: { type: Number, default: null },
    usagePerUser: { type: Number, default: 1 },
    usageCount: { type: Number, default: 0 },
    applicableCategories: [{ type: String }],
    applicableProducts: [{ type: String }],
    userSegments: [{ type: String }],
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
