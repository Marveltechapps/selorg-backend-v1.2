/**
 * Picker Metrics Service
 * On-demand aggregation from DarkstoreOrder (orders) + PickerAttendance (picker_attendance).
 * Computes performance metrics and riskScore (0-100, higher = riskier).
 */

const DarkstoreOrder = require('../models/Order');
const PickerAttendance = require('../../picker/models/attendance.model');
const PickerUser = require('../../picker/models/user.model');
const RefundRequest = require('../../finance/models/RefundRequest');
const { PICKER_STATUS } = require('../../constants/pickerEnums');

const RISK_HIGH_THRESHOLD = 70;
const RISK_WEIGHTS = {
  refundRatio: 30,
  lateAttendance: 25,
  slaBreachRate: 25,
  missingRate: 20,
};
const OFFLINE_THRESHOLD_MS = 90 * 1000;

/**
 * Normalize a 0-1 value for risk (higher raw = higher risk contribution)
 */
function toRiskComponent(raw, cap = 1) {
  return Math.min(cap, Math.max(0, raw));
}

/**
 * Compute riskScore 0-100 from factors
 * Factors: refund ratio, late attendance frequency, sla breach rate, missing item rate
 */
function computeRiskScore(factors) {
  const {
    refundRatio = 0,
    lateAttendanceRatio = 0,
    slaBreachRate = 0,
    missingRate = 0,
  } = factors;

  const w = RISK_WEIGHTS;
  let score =
    toRiskComponent(refundRatio) * (w.refundRatio / 100) +
    toRiskComponent(lateAttendanceRatio) * (w.lateAttendance / 100) +
    toRiskComponent(slaBreachRate) * (w.slaBreachRate / 100) +
    toRiskComponent(missingRate) * (w.missingRate / 100);

  return Math.round(Math.min(100, Math.max(0, score * 100)));
}

/**
 * Get performance metrics for a single picker in date range
 */
async function getPickerPerformance(pickerId, startDate, endDate) {
  const start = new Date(startDate);
  start.setHours(0, 0, 0, 0);
  const end = new Date(endDate);
  end.setHours(23, 59, 59, 999);

  const pickerStr = String(pickerId);

  const [orders, attendances] = await Promise.all([
    DarkstoreOrder.find({
      'pickerAssignment.pickerId': pickerStr,
      status: { $in: ['PICKED', 'PACKED', 'READY_FOR_DISPATCH', 'completed'] },
      updatedAt: { $gte: start, $lte: end },
    })
      .select('order_id pickingData sla_deadline pickerAssignment item_count')
      .lean(),
    PickerAttendance.find({
      userId: pickerId,
      punchIn: { $gte: start, $lte: end },
    })
      .select('lateByMinutes')
      .lean(),
  ]);

  let totalItems = 0;
  let totalDurationSec = 0;
  let durationCount = 0;
  let missingItemsCount = 0;
  let totalOrderItems = 0;
  let slaBreachCount = 0;

  for (const o of orders) {
    const itemCount = o.item_count || 0;
    totalItems += itemCount;
    const pd = o.pickingData || {};
    const pickDuration = pd.pickDuration;
    if (typeof pickDuration === 'number' && pickDuration >= 0) {
      totalDurationSec += pickDuration;
      durationCount++;
    }
    const missing = pd.missingItems || [];
    for (const m of missing) {
      const ord = m.orderedQty ?? 0;
      const scan = m.scannedQty ?? 0;
      missingItemsCount += Math.max(0, ord - scan);
      totalOrderItems += ord;
    }
    if (totalOrderItems === 0 && itemCount > 0) {
      totalOrderItems = itemCount;
    }
    if (o.sla_deadline && pd.endTime) {
      const deadline = new Date(o.sla_deadline).getTime();
      const completed = new Date(pd.endTime).getTime();
      if (completed > deadline) slaBreachCount++;
    }
  }

  const ordersPicked = orders.length;
  const avgPickTimeSec = durationCount > 0 ? totalDurationSec / durationCount : 0;
  const missingRate = totalOrderItems > 0 ? missingItemsCount / totalOrderItems : 0;
  const slaBreachRate = ordersPicked > 0 ? slaBreachCount / ordersPicked : 0;

  const daysDiff = Math.max(1, Math.ceil((end - start) / (24 * 60 * 60 * 1000)));
  const totalWorkedMinutes = attendances.reduce((s, a) => s + (a.totalWorkedMinutes || 0), 0);
  const totalWorkedHours = totalWorkedMinutes / 60;
  const itemsPerHour = totalWorkedHours > 0 ? totalItems / totalWorkedHours : 0;

  const lateCount = attendances.filter((a) => (a.lateByMinutes || 0) > 0).length;
  const lateAttendanceRatio = attendances.length > 0 ? lateCount / attendances.length : 0;

  let refundCount = 0;
  if (ordersPicked > 0) {
    const orderIds = orders.map((o) => o.order_id);
    const refunds = await RefundRequest.find({
      $or: [{ orderNumber: { $in: orderIds } }, { orderId: { $in: orderIds } }],
      status: { $in: ['processed', 'completed', 'approved'] },
    }).lean();
    refundCount = refunds.length;
  }
  const refundRatio = ordersPicked > 0 ? refundCount / ordersPicked : 0;

  const riskScore = computeRiskScore({
    refundRatio,
    lateAttendanceRatio,
    slaBreachRate,
    missingRate,
  });

  return {
    pickerId: pickerStr,
    dateRange: { startDate: start.toISOString(), endDate: end.toISOString() },
    ordersPicked,
    ordersPerDay: ordersPicked / daysDiff,
    avgPickTimeSec: Math.round(avgPickTimeSec * 10) / 10,
    missingRate: Math.round(missingRate * 10000) / 100,
    slaBreachRate: Math.round(slaBreachRate * 10000) / 100,
    itemsPerHour: Math.round(itemsPerHour * 10) / 10,
    riskScore,
    riskLevel: riskScore > RISK_HIGH_THRESHOLD ? 'high' : riskScore > 40 ? 'medium' : 'low',
  };
}

/**
 * List all pickers with optional risk filter
 */
async function listPickersWithMetrics(startDate, endDate, riskFilter) {
  const start = new Date(startDate);
  start.setHours(0, 0, 0, 0);
  const end = new Date(endDate);
  end.setHours(23, 59, 59, 999);

  const pickers = await PickerUser.find({ status: PICKER_STATUS.ACTIVE })
    .select('_id name phone')
    .lean();

  const pickerIds = pickers.map((p) => String(p._id));
  const orderAgg = await DarkstoreOrder.aggregate([
    {
      $match: {
        'pickerAssignment.pickerId': { $in: pickerIds },
        status: { $in: ['PICKED', 'PACKED', 'READY_FOR_DISPATCH', 'completed'] },
        updatedAt: { $gte: start, $lte: end },
      },
    },
    {
      $addFields: {
        missingDelta: {
          $reduce: {
            input: { $ifNull: ['$pickingData.missingItems', []] },
            initialValue: 0,
            in: {
              $add: [
                '$$value',
                {
                  $max: [
                    0,
                    {
                      $subtract: [
                        { $ifNull: ['$$this.orderedQty', 0] },
                        { $ifNull: ['$$this.scannedQty', 0] },
                      ],
                    },
                  ],
                },
              ],
            },
          },
        },
      },
    },
    {
      $group: {
        _id: '$pickerAssignment.pickerId',
        ordersPicked: { $sum: 1 },
        totalItems: { $sum: '$item_count' },
        totalDuration: { $sum: '$pickingData.pickDuration' },
        durationCount: { $sum: { $cond: [{ $gte: ['$pickingData.pickDuration', 0] }, 1, 0] } },
        slaBreaches: {
          $sum: {
            $cond: [
              {
                $and: [
                  { $gt: ['$pickingData.endTime', '$sla_deadline'] },
                  { $ne: ['$pickingData.endTime', null] },
                  { $ne: ['$sla_deadline', null] },
                ],
              },
              1,
              0,
            ],
          },
        },
        missingItemsSum: { $sum: '$missingDelta' },
      },
    },
  ]);

  const attAgg = await PickerAttendance.aggregate([
    {
      $match: {
        userId: { $in: pickers.map((p) => p._id) },
        punchIn: { $gte: start, $lte: end },
      },
    },
    {
      $group: {
        _id: '$userId',
        totalWorkedMinutes: { $sum: '$totalWorkedMinutes' },
        lateCount: { $sum: { $cond: [{ $gt: ['$lateByMinutes', 0] }, 1, 0] } },
        totalShifts: { $sum: 1 },
      },
    },
  ]);

  const orderMap = Object.fromEntries(orderAgg.map((o) => [String(o._id), o]));
  const attMap = Object.fromEntries(attAgg.map((a) => [String(a._id), a]));

  const orderIdsByPicker = {};
  const ordersForRefund = await DarkstoreOrder.find({
    'pickerAssignment.pickerId': { $in: pickerIds },
    status: { $in: ['PICKED', 'PACKED', 'READY_FOR_DISPATCH', 'completed'] },
    updatedAt: { $gte: start, $lte: end },
  })
    .select('order_id pickerAssignment.pickerId')
    .lean();
  for (const o of ordersForRefund) {
    const pid = o.pickerAssignment?.pickerId;
    if (pid) {
      orderIdsByPicker[pid] = orderIdsByPicker[pid] || [];
      orderIdsByPicker[pid].push(o.order_id);
    }
  }

  const refundCountByPicker = {};
  for (const [pid, orderIds] of Object.entries(orderIdsByPicker)) {
    const count = await RefundRequest.countDocuments({
      $or: [{ orderNumber: { $in: orderIds } }, { orderId: { $in: orderIds } }],
      status: { $in: ['processed', 'completed', 'approved'] },
    });
    refundCountByPicker[pid] = count;
  }

  const daysDiff = Math.max(1, Math.ceil((end - start) / (24 * 60 * 60 * 1000)));
  const results = [];

  for (const p of pickers) {
    const pid = String(p._id);
    const ord = orderMap[pid] || {};
    const att = attMap[pid] || {};
    const ordersPicked = ord.ordersPicked || 0;
    const totalItems = ord.totalItems || 0;
    const totalDuration = ord.totalDuration || 0;
    const durationCount = ord.durationCount || 0;
    const slaBreaches = ord.slaBreaches || 0;
    const totalWorkedMinutes = att.totalWorkedMinutes || 0;
    const totalWorkedHours = totalWorkedMinutes / 60;
    const lateCount = att.lateCount || 0;
    const totalShifts = att.totalShifts || 0;

    const missingItemsSum = ord.missingItemsSum || 0;

    const avgPickTimeSec = durationCount > 0 ? totalDuration / durationCount : 0;
    const missingRate = totalItems > 0 ? missingItemsSum / totalItems : 0;
    const slaBreachRate = ordersPicked > 0 ? slaBreaches / ordersPicked : 0;
    const itemsPerHour = totalWorkedHours > 0 ? totalItems / totalWorkedHours : 0;
    const lateAttendanceRatio = totalShifts > 0 ? lateCount / totalShifts : 0;
    const refundCount = refundCountByPicker[pid] || 0;
    const refundRatio = ordersPicked > 0 ? refundCount / ordersPicked : 0;

    const riskScore = computeRiskScore({
      refundRatio,
      lateAttendanceRatio,
      slaBreachRate,
      missingRate,
    });

    if (riskFilter === 'high' && riskScore <= RISK_HIGH_THRESHOLD) continue;

    results.push({
      pickerId: pid,
      pickerName: p.name || p.phone || 'Unknown',
      ordersPerDay: Math.round((ordersPicked / daysDiff) * 100) / 100,
      avgPickTimeSec: Math.round(avgPickTimeSec * 10) / 10,
      missingRate: Math.round(missingRate * 10000) / 100,
      slaBreachRate: Math.round(slaBreachRate * 10000) / 100,
      itemsPerHour: Math.round(itemsPerHour * 10) / 10,
      riskScore,
      riskLevel: riskScore > RISK_HIGH_THRESHOLD ? 'high' : riskScore > 40 ? 'medium' : 'low',
    });
  }

  return results.sort((a, b) => b.riskScore - a.riskScore);
}

/**
 * Get summary KPIs for picker performance dashboard
 */
async function getPerformanceSummary(startDate, endDate) {
  const pickersWithMetrics = await listPickersWithMetrics(startDate, endDate, null);
  const totalPickers = pickersWithMetrics.length;
  if (totalPickers === 0) {
    return {
      totalPickers: 0,
      avgOrdersPerDay: 0,
      avgPickTimeSec: 0,
      avgMissingRate: 0,
      avgSlaBreachRate: 0,
      highRiskCount: 0,
    };
  }

  const avgOrdersPerDay =
    pickersWithMetrics.reduce((s, p) => s + p.ordersPerDay, 0) / totalPickers;
  const avgPickTimeSec =
    pickersWithMetrics.reduce((s, p) => s + p.avgPickTimeSec, 0) / totalPickers;
  const avgMissingRate =
    pickersWithMetrics.reduce((s, p) => s + p.missingRate, 0) / totalPickers;
  const avgSlaBreachRate =
    pickersWithMetrics.reduce((s, p) => s + p.slaBreachRate, 0) / totalPickers;
  const highRiskCount = pickersWithMetrics.filter(
    (p) => p.riskLevel === 'high'
  ).length;

  return {
    totalPickers,
    avgOrdersPerDay: Math.round(avgOrdersPerDay * 100) / 100,
    avgPickTimeSec: Math.round(avgPickTimeSec * 10) / 10,
    avgMissingRate: Math.round(avgMissingRate * 100) / 100,
    avgSlaBreachRate: Math.round(avgSlaBreachRate * 100) / 100,
    highRiskCount,
  };
}

module.exports = {
  getPickerPerformance,
  listPickersWithMetrics,
  getPerformanceSummary,
  computeRiskScore,
  RISK_HIGH_THRESHOLD,
};
