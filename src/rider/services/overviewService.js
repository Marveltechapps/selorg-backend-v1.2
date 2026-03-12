/**
 * Rider overview summary - for Rider Fleet Dashboard
 * Aggregates active riders, orders in transit, SLA metrics
 * All order-side data is sourced from the Rider app's orders collection.
 */
const Rider = require('../models/Rider');
const { Order } = require('../../rider_v2_backend/src/models/Order');
const logger = require('../../core/utils/logger');

const getOverviewSummary = async () => {
  try {
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    // Rider app order statuses that represent "in transit" / actively being worked
    const activeOrderStatuses = ['assigned', 'picked', 'out_for_delivery'];

    const [
      totalRiders,
      activeRidersCount,
      busyRidersCount,
      idleRidersCount,
      ordersInTransit,
      prevHourOrdersInTransit,
      deliveredOrders,
    ] = await Promise.all([
      Rider.countDocuments({}),
      Rider.countDocuments({ status: { $in: ['online', 'busy', 'idle'] } }),
      Rider.countDocuments({ status: 'busy' }),
      Rider.countDocuments({ status: 'idle' }),
      Order.countDocuments({ status: { $in: activeOrderStatuses } }),
      Order.countDocuments({
        status: { $in: activeOrderStatuses },
        updatedAt: { $lt: oneHourAgo },
      }),
      Order.find({
        status: 'delivered',
        updatedAt: { $gte: twentyFourHoursAgo },
      })
        .select('createdAt updatedAt delivery.scheduledTime')
        .lean(),
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

    // Compute average delivery time and SLA adherence using rider app order timestamps
    let avgDeliveryTimeSeconds = 0;
    let avgDeliveryTimeWithinSla = true;
    let slaBreaches = 0;

    if (deliveredOrders.length > 0) {
      let totalSeconds = 0;
      let breaches = 0;

      for (const o of deliveredOrders) {
        const createdAt = o.createdAt ? new Date(o.createdAt) : null;
        const deliveredAt = o.updatedAt ? new Date(o.updatedAt) : null;
        const scheduledTime = o.delivery && o.delivery.scheduledTime
          ? new Date(o.delivery.scheduledTime)
          : null;

        if (createdAt && deliveredAt) {
          const diffSeconds = Math.max(0, Math.round((deliveredAt - createdAt) / 1000));
          totalSeconds += diffSeconds;

          const targetTime = scheduledTime || new Date(createdAt.getTime() + 15 * 60 * 1000);
          if (deliveredAt.getTime() > targetTime.getTime()) {
            breaches += 1;
          }
        }
      }

      if (totalSeconds > 0) {
        avgDeliveryTimeSeconds = Math.round(totalSeconds / deliveredOrders.length);
        const targetSeconds = 15 * 60; // 15 min default
        avgDeliveryTimeWithinSla = avgDeliveryTimeSeconds <= targetSeconds;
      }

      slaBreaches = breaches;
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
      slaBreaches,
    };
  } catch (error) {
    logger.error('Error in getOverviewSummary:', error);
    throw error;
  }
};

module.exports = {
  getOverviewSummary,
};
