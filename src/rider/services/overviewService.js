/**
 * Rider overview summary - for Rider Fleet Dashboard
 * Aggregates active riders, orders in transit, SLA metrics
 */
const Rider = require('../models/Rider');
const Order = require('../../warehouse/models/Order');
const logger = require('../../core/utils/logger');

const getOverviewSummary = async () => {
  try {
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const [
      totalRiders,
      activeRidersCount,
      busyRidersCount,
      idleRidersCount,
      ordersInTransit,
      prevHourOrdersInTransit,
      deliveredOrders,
      breachedOrders,
    ] = await Promise.all([
      Rider.countDocuments({}),
      Rider.countDocuments({ status: { $in: ['online', 'busy', 'idle'] } }),
      Rider.countDocuments({ status: 'busy' }),
      Rider.countDocuments({ status: 'idle' }),
      Order.countDocuments({ status: { $in: ['assigned', 'picked_up', 'in_transit'] } }),
      Order.countDocuments({
        status: { $in: ['assigned', 'picked_up', 'in_transit'] },
        updatedAt: { $lt: oneHourAgo },
      }),
      Order.find({
        status: 'delivered',
        completedAt: { $gte: twentyFourHoursAgo },
        deliveryTimeSeconds: { $exists: true, $ne: null },
      })
        .select('deliveryTimeSeconds slaDeadline completedAt')
        .lean(),
      Order.countDocuments({ status: 'delayed' }),
    ]);

    const maxRiders = totalRiders || 0;
    const activeRiders = activeRidersCount || 0;
    const busyRiders = busyRidersCount || 0;
    const idleRiders = idleRidersCount || 0;
    const activeRiderUtilizationPercent =
      activeRiders > 0 ? Math.round((busyRiders / activeRiders) * 100) : 0;
    const fleetUtilizationPercent =
      maxRiders > 0 ? Math.round((activeRiders / maxRiders) * 100) : 0;

    let ordersInTransitChangePercent = 0;
    if (prevHourOrdersInTransit > 0 && ordersInTransit !== prevHourOrdersInTransit) {
      ordersInTransitChangePercent = Math.round(
        ((ordersInTransit - prevHourOrdersInTransit) / prevHourOrdersInTransit) * 100
      );
    }

    let avgDeliveryTimeSeconds = 0;
    let avgDeliveryTimeWithinSla = true;
    if (deliveredOrders.length > 0) {
      const total = deliveredOrders.reduce((sum, o) => sum + (o.deliveryTimeSeconds || 0), 0);
      avgDeliveryTimeSeconds = Math.round(total / deliveredOrders.length);
      const targetSeconds = 15 * 60; // 15 min default
      avgDeliveryTimeWithinSla = avgDeliveryTimeSeconds <= targetSeconds;
    }

    return {
      activeRiders,
      maxRiders,
      busyRiders,
      idleRiders,
      activeRiderUtilizationPercent,
      fleetUtilizationPercent,
      ordersInTransit: ordersInTransit || 0,
      ordersInTransitChangePercent,
      avgDeliveryTimeSeconds,
      avgDeliveryTimeWithinSla,
      slaBreaches: breachedOrders || 0,
    };
  } catch (error) {
    logger.error('Error in getOverviewSummary:', error);
    throw error;
  }
};

module.exports = {
  getOverviewSummary,
};
