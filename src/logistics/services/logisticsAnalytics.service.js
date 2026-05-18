'use strict';

const LogisticsOrder = require('../models/logisticsOrder.model');
const LogisticsMetric = require('../models/logisticsMetric.model');

async function costPerRoute(from, to) {
  const match = {
    status: 'DELIVERED',
    deliveredAt: { $gte: from, $lte: to },
  };
  const rows = await LogisticsOrder.find(match).select('actualFare estimatedFare distanceKm referenceId type provider').lean();
  const enriched = rows.map((r) => {
    const fare = r.actualFare ?? r.estimatedFare ?? 0;
    const km = Math.max(r.distanceKm || 0, 0.001);
    return {
      referenceId: r.referenceId,
      type: r.type,
      provider: r.provider,
      fare,
      distanceKm: r.distanceKm,
      costPerKm: fare / km,
    };
  });
  const avgCostPerKm =
    enriched.length === 0 ? 0 : enriched.reduce((s, x) => s + x.costPerKm, 0) / enriched.length;
  return { from, to, count: enriched.length, avgCostPerKm, routes: enriched };
}

async function slaBreaches() {
  const since = new Date(Date.now() - 7 * 864e5);
  const breaches = await LogisticsMetric.find({ slaBreached: true, recordedAt: { $gte: since } })
    .sort({ recordedAt: -1 })
    .limit(200)
    .lean();
  return { count: breaches.length, items: breaches };
}

async function dashboardKpis() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const [createdToday, inTransit, delivered, agg] = await Promise.all([
    LogisticsOrder.countDocuments({ createdAt: { $gte: start } }),
    LogisticsOrder.countDocuments({ status: 'IN_TRANSIT' }),
    LogisticsOrder.countDocuments({ status: 'DELIVERED', deliveredAt: { $gte: start } }),
    LogisticsOrder.aggregate([
      { $match: { status: 'DELIVERED', deliveredAt: { $gte: start } } },
      {
        $project: {
          mins: {
            $divide: [{ $subtract: ['$deliveredAt', '$createdAt'] }, 60000],
          },
          fare: { $ifNull: ['$actualFare', '$estimatedFare'] },
          km: '$distanceKm',
        },
      },
      {
        $group: {
          _id: null,
          avgMins: { $avg: '$mins' },
          sumFare: { $sum: '$fare' },
          sumKm: { $sum: '$km' },
          n: { $sum: 1 },
        },
      },
    ]),
  ]);
  const g = agg[0] || {};
  const costPerKm = g.sumKm > 0 ? g.sumFare / g.sumKm : 0;
  return {
    ordersToday: createdToday,
    inTransit,
    deliveredToday: delivered,
    avgDeliveryMinutes: g.avgMins || 0,
    costPerKm: Number.isFinite(costPerKm) ? costPerKm : 0,
  };
}

module.exports = { costPerRoute, slaBreaches, dashboardKpis };
