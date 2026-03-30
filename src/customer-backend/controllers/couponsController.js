const { listActiveCoupons, validateCoupon } = require('../services/couponsService');
const { PricingCoupon: Coupon } = require('../../merch/models/PricingCoupon');
const { CouponRedemption } = require('../models/CouponRedemption');
const mongoose = require('mongoose');

async function list(req, res) {
  try {
    const { userId, cartValue, zone, paymentMethod } = req.query;
    const data = await listActiveCoupons({
      userId,
      cartValue: parseFloat(cartValue) || 0,
      zone,
      paymentMethod
    });
    res.status(200).json({ success: true, coupons: data });
  } catch (err) {
    console.error('coupons list error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
}

async function validate(req, res) {
  try {
    const { coupon_code, user_id, cart_items, cart_value, payment_method, zone, delivery_fee } = req.body;
    const result = await validateCoupon(
      coupon_code,
      user_id || req.user?._id,
      cart_items || [],
      parseFloat(cart_value) || 0,
      payment_method || 'ALL',
      zone || '',
      parseFloat(delivery_fee) || 0
    );
    res.status(200).json(result);
  } catch (err) {
    console.error('coupons validate error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
}

async function redeem(req, res) {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { coupon_code, user_id, order_id, cart_items, cart_value, payment_method, zone, delivery_fee } = req.body;
    
    // Validate again inside transaction to prevent race conditions
    const result = await validateCoupon(
      coupon_code,
      user_id || req.user?._id,
      cart_items || [],
      parseFloat(cart_value) || 0,
      payment_method || 'ALL',
      zone || '',
      parseFloat(delivery_fee) || 0
    );

    if (!result.valid) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json(result);
    }

    const normalizedCode = String(coupon_code || '').toUpperCase();
    const coupon = await Coupon.findOne({ code: normalizedCode }).session(session);

    if (!coupon) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ valid: false, error_code: 'INVALID_CODE' });
    }

    // Update usage count
    await Coupon.updateOne(
      { _id: coupon._id },
      { $inc: { usageCount: 1 } }
    ).session(session);

    // Create redemption record
    await CouponRedemption.create([{
      couponId: coupon._id,
      userId: new mongoose.Types.ObjectId(user_id || req.user?._id),
      orderId: new mongoose.Types.ObjectId(order_id),
      discountApplied: result.discount_amount,
    }], { session });

    await session.commitTransaction();
    session.endSession();

    res.json({ success: true, discount_applied: result.discount_amount });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    console.error('Redemption failed:', err);
    res.status(500).json({ error: 'Redemption failed' });
  }
}

module.exports = { list, validate, redeem };
