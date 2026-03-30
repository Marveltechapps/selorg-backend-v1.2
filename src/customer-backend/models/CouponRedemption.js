const mongoose = require('mongoose');

const couponRedemptionSchema = new mongoose.Schema(
  {
    couponId: { type: mongoose.Schema.Types.ObjectId, ref: 'CustomerCoupon', required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'CustomerUser', required: true },
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'CustomerOrder', required: true },
    discountApplied: { type: Number, required: true },
    redeemedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

couponRedemptionSchema.index({ couponId: 1, userId: 1 });
couponRedemptionSchema.index({ orderId: 1 });

const CouponRedemption =
  mongoose.models.CouponRedemption ||
  mongoose.model('CouponRedemption', couponRedemptionSchema, 'coupon_redemptions');

module.exports = { CouponRedemption };
