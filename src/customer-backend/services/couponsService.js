const { PricingCoupon: Coupon } = require('../../merch/models/PricingCoupon');
const { Order } = require('../models/Order');
const { CouponRedemption } = require('../models/CouponRedemption');
const mongoose = require('mongoose');

/**
 * Validates a coupon based on multiple criteria.
 * Server-side implementation of the validation logic.
 */
async function validateCoupon(couponCode, userId, cartItems, cartValue, paymentMethod, zone, deliveryFee) {
  const now = new Date();
  
  // STEP 1 — Does coupon exist?
  const coupon = await Coupon.findOne({ code: String(couponCode || '').toUpperCase() }).lean();
  if (!coupon) return { valid: false, error_code: 'INVALID_CODE' };

  // STEP 2 — Is status ACTIVE?
  // User logic says 'ACTIVE', but PricingCoupon model uses lowercase 'active', 'paused', 'expired'
  // I will support both just in case, but prefer model's enum.
  const status = String(coupon.status || '').toUpperCase();
  if (status !== 'ACTIVE' && coupon.status !== 'active') {
    return { valid: false, error_code: 'COUPON_INACTIVE' };
  }

  // STEP 3 — Within datetime window?
  // PricingCoupon uses startDate/endDate or validFrom/validTo
  const start = coupon.startDate || coupon.validFrom;
  const end = coupon.endDate || coupon.validTo;

  if (start && now < new Date(start))
    return { valid: false, error_code: 'COUPON_NOT_VALID_NOW' };
  if (end && now > new Date(end))
    return { valid: false, error_code: 'COUPON_NOT_VALID_NOW' };

  // STEP 3b — Valid day of week?
  if (coupon.validDays && coupon.validDays.length > 0) {
    const days = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
    const today = days[now.getDay()];
    if (!coupon.validDays.includes(today))
      return { valid: false, error_code: 'COUPON_NOT_VALID_NOW' };
  }

  // STEP 3c — Valid time slot?
  if (coupon.validTimeSlots && coupon.validTimeSlots.length > 0) {
    const hhmm = now.getHours() * 60 + now.getMinutes();
    const inSlot = coupon.validTimeSlots.some(slot => {
      const [fh, fm] = slot.from.split(':').map(Number);
      const [th, tm] = slot.to.split(':').map(Number);
      return hhmm >= fh * 60 + fm && hhmm <= th * 60 + tm;
    });
    if (!inSlot) return { valid: false, error_code: 'COUPON_NOT_VALID_NOW' };
  }

  // STEP 4 — Customer segment eligible?
  if (coupon.isFirstOrderOnly) {
    const priorOrdersCount = await Order.countDocuments({
      userId: new mongoose.Types.ObjectId(userId),
      status: 'delivered', // Match Order model's enum
    });
    if (priorOrdersCount > 0)
      return { valid: false, error_code: 'NOT_ELIGIBLE' };
  }

  if (coupon.targetSegment === 'NEW_USERS') {
    const totalOrders = await Order.countDocuments({ userId: new mongoose.Types.ObjectId(userId) });
    if (totalOrders > 0) return { valid: false, error_code: 'NOT_ELIGIBLE' };
  }

  if (coupon.targetSegment === 'LAPSED_30D') {
    const lastOrder = await Order.findOne({ userId: new mongoose.Types.ObjectId(userId) })
      .sort({ createdAt: -1 })
      .lean();
    if (lastOrder) {
      const daysSince = (now - new Date(lastOrder.createdAt)) / 86400000;
      if (daysSince < 30) return { valid: false, error_code: 'NOT_ELIGIBLE' };
    }
  }

  if (coupon.targetSegment === 'SPECIFIC_USER_IDS') {
    if (!coupon.targetUserIds || !coupon.targetUserIds.includes(String(userId)))
      return { valid: false, error_code: 'NOT_ELIGIBLE' };
  }

  if (coupon.targetZones && coupon.targetZones.length > 0) {
    if (!coupon.targetZones.includes(zone))
      return { valid: false, error_code: 'NOT_ELIGIBLE' };
  }

  // STEP 5 — Qualifying cart value >= min_order_value?
  let qualifyingValue = cartValue;
  const minOrderValue = coupon.minOrderValue || coupon.minOrderAmount || 0;

  if (coupon.discountOn === 'CATEGORY' && coupon.applicableCategories && coupon.applicableCategories.length > 0) {
    qualifyingValue = cartItems
      .filter(item => !coupon.excludeSaleItems || !item.isOnSale)
      .filter(item => coupon.applicableCategories.includes(item.category))
      .reduce((sum, item) => sum + item.price * (item.qty || item.quantity || 0), 0);
  }

  if (coupon.discountOn === 'SPECIFIC_SKU' && coupon.applicableSkuIds && coupon.applicableSkuIds.length > 0) {
    qualifyingValue = cartItems
      .filter(item => !coupon.excludeSaleItems || !item.isOnSale)
      .filter(item => coupon.applicableSkuIds.includes(item.skuId || item.sku_id))
      .reduce((sum, item) => sum + item.price * (item.qty || item.quantity || 0), 0);
  }

  if (qualifyingValue < minOrderValue)
    return { valid: false, error_code: 'MIN_ORDER_NOT_MET', min_required: minOrderValue };

  // STEP 6 — Usage limits?
  const totalLimit = coupon.usageLimit || 0;
  const currentUsage = coupon.usageCount || 0;
  if (totalLimit > 0 && currentUsage >= totalLimit)
    return { valid: false, error_code: 'COUPON_EXHAUSTED' };

  const userUsageCount = await CouponRedemption.countDocuments({
    couponId: coupon._id,
    userId: new mongoose.Types.ObjectId(userId)
  });
  
  const perUserLimit = coupon.usagePerUser || 1;
  if (userUsageCount >= perUserLimit)
    return { valid: false, error_code: 'COUPON_EXHAUSTED' };

  // STEP 7 — Payment method?
  const paymentRestriction = String(coupon.paymentRestriction || 'ALL').toUpperCase();
  if (paymentRestriction !== 'ALL' &&
      paymentRestriction !== String(paymentMethod || '').toUpperCase()) {
    return { 
      valid: false, 
      error_code: 'PAYMENT_METHOD_NOT_ELIGIBLE',
      allowed: paymentRestriction 
    };
  }

  // STEP 8 — Calculate discount amount
  let discountAmount = 0;
  const discountType = coupon.discountType;
  const discountValue = coupon.discountValue || 0;
  const maxCap = coupon.maxDiscount || coupon.maxDiscountAmount;

  if (discountType === 'FLAT_DISCOUNT' || discountType === 'fixed' || discountType === 'flat') {
    discountAmount = discountValue;
  } else if (discountType === 'PERCENTAGE' || discountType === 'percentage' || discountType === 'percent') {
    discountAmount = (qualifyingValue * discountValue) / 100;
    if (maxCap) discountAmount = Math.min(discountAmount, maxCap);
  } else if (discountType === 'FREE_DELIVERY' || discountType === 'free_delivery') {
    discountAmount = Math.min(deliveryFee, maxCap || deliveryFee);
  } else if (discountType === 'CASHBACK') {
    discountAmount = 0; // credited post-delivery
  } else if (discountType === 'TIERED_FLAT') {
    const tier = (coupon.tiers || [])
      .filter(t => qualifyingValue >= t.minOrder)
      .sort((a, b) => b.minOrder - a.minOrder)[0];
    discountAmount = tier ? tier.discountAmount : 0;
  } else if (discountType === 'BOGO') {
    const eligible = cartItems.filter(i => (coupon.applicableSkuIds || []).includes(i.skuId || i.sku_id));
    const cheapest = eligible.sort((a, b) => a.price - b.price)[0];
    discountAmount = cheapest ? cheapest.price : 0;
  }

  discountAmount = Math.min(discountAmount, qualifyingValue);

  return {
    valid: true,
    discount_amount: parseFloat(discountAmount.toFixed(2)),
    coupon_type: discountType,
    display_name: coupon.name || coupon.code,
    is_cashback: discountType === 'CASHBACK',
    cashback_value: discountType === 'CASHBACK' ? discountValue : 0
  };
}

/**
 * List active coupons for the customer app.
 */
async function listActiveCoupons(params = {}) {
  const { userId, cartValue = 0, zone = '', paymentMethod = 'ALL' } = params;
  const now = new Date();
  
  // Basic filtering for active coupons in the date window
  const coupons = await Coupon.find({
    status: { $in: ['active', 'ACTIVE'] },
    $and: [
      { $or: [{ startDate: null }, { startDate: { $lte: now } }] },
      { $or: [{ endDate: null }, { endDate: { $gte: now } }] },
    ],
  })
    .sort({ priorityRank: 1 })
    .lean();

  return coupons;
}

module.exports = { validateCoupon, listActiveCoupons };
