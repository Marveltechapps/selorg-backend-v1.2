/**
 * Pricing stats aggregation - computes metrics from orders and pricing entities.
 * Returns zeros when no data available.
 */
const DiscountCampaign = require('../models/DiscountCampaign');
const { PricingCoupon } = require('../models/PricingCoupon');

// Customer Order model - shared DB
let Order;
try {
  Order = require('../../customer-backend/models/Order');
} catch (e) {
  Order = null;
}

async function getPricingStats() {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
  const expiringSoon = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const result = {
    totalCoupons: 0,
    totalRedemptions: 0,
    avgDiscountValue: 0,
    expiringSoonCoupons: 0,
    totalRevenue: 0,
    discountedRevenue: 0,
    totalDiscount: 0,
    avgOrderValue: 0,
    activeDiscounts: 0,
    activeCoupons: 0,
    couponRedemptionRate: 0,
  };

  try {
    // Coupon-centric stats used by admin Pricing & Promo cards
    const couponAgg = await PricingCoupon.aggregate([
      {
        $group: {
          _id: null,
          totalCoupons: { $sum: 1 },
          totalRedemptions: { $sum: { $ifNull: ['$usageCount', 0] } },
          avgDiscountValue: { $avg: { $ifNull: ['$discountValue', 0] } },
        },
      },
    ]);
    if (couponAgg.length > 0) {
      result.totalCoupons = couponAgg[0].totalCoupons || 0;
      result.totalRedemptions = couponAgg[0].totalRedemptions || 0;
      result.avgDiscountValue = Math.round((couponAgg[0].avgDiscountValue || 0) * 100) / 100;
    }

    // Active discounts count
    const activeDiscounts = await DiscountCampaign.countDocuments({
      status: 'active',
      startDate: { $lte: now },
      endDate: { $gte: now },
    });
    result.activeDiscounts = activeDiscounts;

    // Active coupons count (status active and within date range)
    const activeCoupons = await PricingCoupon.countDocuments({
      $or: [{ status: 'active' }, { isActive: true }],
      $and: [
        { $or: [{ startDate: null }, { startDate: { $lte: now } }] },
        { $or: [{ endDate: null }, { endDate: { $gte: now } }] },
      ],
    });
    result.activeCoupons = activeCoupons;

    const expiringSoonCoupons = await PricingCoupon.countDocuments({
      $or: [{ status: 'active' }, { isActive: true }],
      endDate: { $gte: now, $lte: expiringSoon },
    });
    result.expiringSoonCoupons = expiringSoonCoupons;

    // Order aggregates if Order model available
    if (Order) {
      const ordersThisMonth = await Order.aggregate([
        {
          $match: {
            status: { $nin: ['cancelled'] },
            createdAt: { $gte: startOfMonth, $lte: endOfMonth },
          },
        },
        {
          $group: {
            _id: null,
            totalRevenue: { $sum: '$totalBill' },
            totalDiscount: { $sum: { $ifNull: ['$discount', 0] } },
            orderCount: { $sum: 1 },
          },
        },
      ]);

      if (ordersThisMonth.length > 0) {
        const agg = ordersThisMonth[0];
        result.totalRevenue = agg.totalRevenue || 0;
        result.totalDiscount = agg.totalDiscount || 0;
        const count = agg.orderCount || 0;
        result.avgOrderValue = count > 0 ? Math.round((result.totalRevenue / count) * 100) / 100 : 0;
        result.discountedRevenue = result.totalRevenue - result.totalDiscount;

        // Simple redemption rate: orders with discount > 0 / total orders
        const withDiscount = await Order.countDocuments({
          status: { $nin: ['cancelled'] },
          createdAt: { $gte: startOfMonth, $lte: endOfMonth },
          discount: { $gt: 0 },
        });
        result.couponRedemptionRate = count > 0 ? Math.round((withDiscount / count) * 10000) / 100 : 0;
      }
    }
  } catch (err) {
    console.error('pricingStatsService error:', err);
  }

  return result;
}

module.exports = { getPricingStats };
