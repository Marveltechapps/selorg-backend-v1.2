/**
 * Rider overview summary - for Rider Fleet Dashboard
 * Aggregates active riders, orders in transit, SLA metrics
 * Rider counts use riders_v2 (mobile app) availability, not legacy Rider.status.
 */
const { Rider: RiderV2 } = require('../../rider_v2_backend/src/models/Rider');
const { Order } = require('../../rider_v2_backend/src/models/Order');
const logger = require('../../core/utils/logger');

const ACTIVE_ORDER_STATUSES = ['assigned', 'picked', 'picked_up', 'out_for_delivery', 'in_transit'];

const operationalRiderFilter = {
  deletedAt: { $exists: false },
  status: { $nin: ['suspended', 'deleted', 'inactive'] },
  $or: [
    { status: { $in: ['approved', 'active'] } },
    { status: 'pending', isVerified: true },
    { availability: { $in: ['available', 'busy'] } },
  ],
};

const getOverviewSummary = async () => {
  try {
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const [
      totalRiders,
      availableRidersCount,
      busyRidersCount,
      ordersInTransit,
      prevHourOrdersInTransit,
      deliveredOrders,
    ] = await Promise.all([
      RiderV2.countDocuments(operationalRiderFilter),
      RiderV2.countDocuments({ ...operationalRiderFilter, availability: 'available' }),
      RiderV2.countDocuments({ ...operationalRiderFilter, availability: 'busy' }),
      Order.countDocuments({ status: { $in: ACTIVE_ORDER_STATUSES } }),
      Order.countDocuments({
        status: { $in: ACTIVE_ORDER_STATUSES },
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
    const idleRiders = availableRidersCount || 0;
    const busyRiders = busyRidersCount || 0;
    const activeRiders = idleRiders + busyRiders;
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
    let slaBreaches = 0;

    if (deliveredOrders.length > 0) {
      let totalSeconds = 0;
      let breaches = 0;

      for (const o of deliveredOrders) {
        const createdAt = o.createdAt ? new Date(o.createdAt) : null;
        const deliveredAt = o.updatedAt ? new Date(o.updatedAt) : null;
        const scheduledTime =
          o.delivery && o.delivery.scheduledTime ? new Date(o.delivery.scheduledTime) : null;

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
        const targetSeconds = 15 * 60;
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
