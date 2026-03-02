const logger = require('../../utils/logger');

let Payout;
let Order;
try {
  const payoutModule = require('../../rider_v2_backend/src/models/Payout.js');
  Payout = payoutModule.Payout || payoutModule.default;
  const orderModule = require('../../rider_v2_backend/src/models/Order.js');
  Order = orderModule.Order || orderModule.default;
} catch (e) {
  logger.warn('Rider v2 models not available, rider cash features disabled:', e.message);
}

function ensureModels() {
  if (!Payout || !Order) {
    throw new Error('Rider cash module not available');
  }
}

async function getRiderCashSummary() {
  ensureModels();
  try {
    const [pendingPayouts, completedToday, codStats] = await Promise.all([
      Payout.find({ status: { $in: ['pending', 'approved', 'processing'] } }).lean(),
      Payout.find({
        status: 'completed',
        completedAt: {
          $gte: new Date(new Date().setHours(0, 0, 0, 0)),
          $lt: new Date(),
        },
      }).lean(),
      getCodReconciliationStats(),
    ]);

    const pendingAmount = pendingPayouts.reduce((sum, p) => sum + (p.amount || 0), 0);
    const completedTodayAmount = completedToday.reduce((sum, p) => sum + (p.amount || 0), 0);

    return {
      pendingPayoutCount: pendingPayouts.length,
      pendingPayoutAmount: pendingAmount,
      completedTodayCount: completedToday.length,
      completedTodayAmount,
      codCollected: codStats.codCollected,
      codDeposited: codStats.codDeposited,
      codOutstanding: codStats.codOutstanding,
    };
  } catch (error) {
    logger.error('Error fetching rider cash summary:', error);
    throw error;
  }
}

async function getCodReconciliationStats() {
  if (!Order) return { codCollected: 0, codDeposited: 0, codOutstanding: 0 };
  try {
    const codOrders = await Order.find({
      'payment.method': 'cod',
      status: 'delivered',
      'payment.status': 'completed',
    })
      .select('pricing.total payment')
      .lean();

    const codCollected = codOrders.reduce((sum, o) => sum + (o.pricing?.total || o.payment?.amount || 0), 0);

    return {
      codCollected,
      codDeposited: codCollected,
      codOutstanding: 0,
    };
  } catch (e) {
    logger.warn('COD stats error:', e.message);
    return { codCollected: 0, codDeposited: 0, codOutstanding: 0 };
  }
}

async function getRiderPayoutsList(page = 1, pageSize = 20, status) {
  ensureModels();
  try {
    const query = {};
    if (status && status !== 'all') {
      query.status = status;
    }
    const skip = (Math.max(1, page) - 1) * pageSize;
    const [data, total] = await Promise.all([
      Payout.find(query).sort({ requestedAt: -1 }).skip(skip).limit(pageSize).lean(),
      Payout.countDocuments(query),
    ]);

    return {
      data: data.map((p) => ({
        id: p._id?.toString(),
        payoutNumber: p.payoutNumber,
        riderId: p.riderId,
        riderPhoneNumber: p.riderPhoneNumber,
        amount: p.amount,
        baseAmount: p.baseAmount,
        incentiveAmount: p.incentiveAmount,
        status: p.status,
        method: p.method,
        requestedAt: p.requestedAt,
        completedAt: p.completedAt,
        periodStart: p.periodStart,
        periodEnd: p.periodEnd,
      })),
      total,
      page: Math.max(1, page),
      pageSize,
    };
  } catch (error) {
    logger.error('Error fetching rider payouts:', error);
    throw error;
  }
}

module.exports = {
  getRiderCashSummary,
  getCodReconciliationStats,
  getRiderPayoutsList,
};
