const mongoose = require('mongoose');

const couponSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true, uppercase: true },
    description: { type: String, default: '' },
    discountType: { type: String, enum: ['percent', 'fixed'], default: 'percent' },
    discountValue: { type: Number, required: true, min: 0 },
    minOrderAmount: { type: Number, default: 0 },
    maxDiscountAmount: { type: Number, default: null },
    validFrom: { type: Date, default: null },
    validTo: { type: Date, default: null },
    isActive: { type: Boolean, default: true },
    usageLimit: { type: Number, default: null },
    usageCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

couponSchema.index({ code: 1, isActive: 1 });
couponSchema.index({ validFrom: 1, validTo: 1 });

const Coupon =
  mongoose.models.CustomerCoupon ||
  mongoose.model('CustomerCoupon', couponSchema, 'customer_coupons');

module.exports = { Coupon };
