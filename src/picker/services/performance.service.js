/**
 * Performance metrics from shared DB (HHD completedorders by hhdUserId).
 * Single source of truth so Picker app and HHD device show same numbers.
 */
const HHDCompletedOrder = require('../../hhd/models/CompletedOrder.model');
const mongoose = require('mongoose');

/**
 * Get start of day in local or UTC (default UTC for consistency).
 */
function startOfDay(d, utc = true) {
  const x = new Date(d);
  if (utc) {
    x.setUTCHours(0, 0, 0, 0);
  } else {
    x.setHours(0, 0, 0, 0);
  }
  return x;
}

/**
 * Summary: orders completed today and this week for the linked HHD user.
 */
async function getSummary(hhdUserId) {
  const now = new Date();
  const todayStart = startOfDay(now);
  const weekStart = new Date(todayStart);
  weekStart.setUTCDate(weekStart.getUTCDate() - 7);

  const [todayCount, weekCount] = await Promise.all([
    HHDCompletedOrder.countDocuments({
      userId: hhdUserId,
      completedAt: { $gte: todayStart, $lte: now },
    }),
    HHDCompletedOrder.countDocuments({
      userId: hhdUserId,
      completedAt: { $gte: weekStart, $lte: now },
    }),
  ]);

  return {
    today: todayCount,
    last7Days: weekCount,
  };
}

/**
 * History: list or time-series of completed orders for charts (paginated).
 */
async function getHistory(hhdUserId, options = {}) {
  const { page = 1, limit = 50, from, to } = options;
  const query = { userId: hhdUserId };
  if (from || to) {
    query.completedAt = {};
    if (from) query.completedAt.$gte = new Date(from);
    if (to) query.completedAt.$lte = new Date(to);
  }
  const skip = (Number(page) - 1) * Number(limit);
  const [orders, total] = await Promise.all([
    HHDCompletedOrder.find(query).sort({ completedAt: -1 }).skip(skip).limit(Number(limit)).lean(),
    HHDCompletedOrder.countDocuments(query),
  ]);
  return { orders, total, page: Number(page), pages: Math.ceil(total / Number(limit)) };
}

module.exports = {
  getSummary,
  getHistory,
};
