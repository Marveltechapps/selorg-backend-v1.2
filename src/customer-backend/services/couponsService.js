const { Coupon } = require('../models/Coupon');

function isCouponValid(coupon, orderAmount = 0) {
  if (!coupon || !coupon.isActive) return { valid: false, message: 'Coupon is invalid or inactive' };
  const now = new Date();
  if (coupon.validFrom && now < coupon.validFrom) return { valid: false, message: 'Coupon is not yet valid' };
  if (coupon.validTo && now > coupon.validTo) return { valid: false, message: 'Coupon has expired' };
  if (coupon.usageLimit != null && (coupon.usageCount || 0) >= coupon.usageLimit) return { valid: false, message: 'Coupon usage limit reached' };
  if (orderAmount > 0 && coupon.minOrderAmount > 0 && orderAmount < coupon.minOrderAmount) {
    return { valid: false, message: `Minimum order amount is ${coupon.minOrderAmount}` };
  }
  return { valid: true };
}

function computeDiscount(coupon, orderAmount) {
  if (!coupon) return 0;
  let discount = 0;
  if (coupon.discountType === 'percent') {
    discount = (orderAmount * Math.min(100, coupon.discountValue)) / 100;
  } else {
    discount = Math.min(orderAmount, coupon.discountValue);
  }
  if (coupon.maxDiscountAmount != null && coupon.maxDiscountAmount > 0 && discount > coupon.maxDiscountAmount) {
    discount = coupon.maxDiscountAmount;
  }
  return Math.round(discount * 100) / 100;
}

async function listActive() {
  const now = new Date();
  const list = await Coupon.find({
    isActive: true,
    $and: [
      { $or: [{ validFrom: null }, { validFrom: { $lte: now } }] },
      { $or: [{ validTo: null }, { validTo: { $gte: now } }] },
    ],
  })
    .sort({ createdAt: -1 })
    .lean();
  return list.map((c) => ({
    id: String(c._id),
    code: c.code,
    description: c.description,
    discountType: c.discountType,
    discountValue: c.discountValue,
    minOrderAmount: c.minOrderAmount,
    maxDiscountAmount: c.maxDiscountAmount,
    validFrom: c.validFrom,
    validTo: c.validTo,
  }));
}

async function validateCode(code, orderAmount = 0) {
  const normalized = String(code || '').trim().toUpperCase();
  if (!normalized) return { valid: false, message: 'Code is required', discount: 0 };
  const coupon = await Coupon.findOne({ code: normalized }).lean();
  const check = isCouponValid(coupon, orderAmount);
  if (!check.valid) {
    return { valid: false, message: check.message, discount: 0 };
  }
  const discount = computeDiscount(coupon, orderAmount);
  return {
    valid: true,
    message: 'Valid',
    discount,
    code: coupon.code,
    description: coupon.description,
    discountType: coupon.discountType,
    discountValue: coupon.discountValue,
  };
}

async function applyCode(userId, code, orderAmount = 0) {
  const result = await validateCode(code, orderAmount);
  if (!result.valid) {
    return { success: false, message: result.message, discount: 0 };
  }
  return {
    success: true,
    message: 'Coupon applied',
    discount: result.discount,
    code: result.code,
    appliedCoupon: {
      code: result.code,
      discount: result.discount,
    },
  };
}

module.exports = { listActive, validateCode, applyCode, computeDiscount };
