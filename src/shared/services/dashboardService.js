const Rider = require('../../rider/models/Rider');
const Order = require('../../warehouse/models/Order');
const appConfig = require('../../config/app');
const logger = require('../../core/utils/logger');

const getDashboardSummary = async () => {
  try {
    // Active riders count
    const activeRiders = await Rider.countDocuments({
      status: { $in: ['online', 'busy', 'idle'] },
    });

    // Max riders (from system config or count all riders)
    const maxRiders = await Rider.countDocuments();

    // Busy riders count
    const busyRiders = await Rider.countDocuments({ status: 'busy' });
    
    // Idle riders count
    const idleRiders = await Rider.countDocuments({ status: 'idle' });

    // Active rider utilization percent (busy / active)
    // This represents what percentage of active riders are currently busy
    const activeRiderUtilizationPercent = activeRiders > 0
      ? Math.round((busyRiders / activeRiders) * 100)
      : 0;
    
    // Also calculate overall fleet utilization (active / total)
    const fleetUtilizationPercent = maxRiders > 0
      ? Math.round((activeRiders / maxRiders) * 100)
      : 0;

    // Orders in transit
    const ordersInTransit = await Order.countDocuments({
      status: { $in: ['assigned', 'picked_up', 'in_transit', 'delayed'] },
    });

    // Orders in transit change percent (compare with 1 hour ago)
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const previousOrdersInTransit = await Order.countDocuments({
      status: { $in: ['assigned', 'picked_up', 'in_transit', 'delayed'] },
      createdAt: { $lt: oneHourAgo },
    });

    const ordersInTransitChangePercent = previousOrdersInTransit > 0
      ? ((ordersInTransit - previousOrdersInTransit) / previousOrdersInTransit) * 100
      : 0;

    // Average delivery time (last 24 hours)
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const deliveredOrders = await Order.find({
      status: 'delivered',
      completedAt: { $gte: twentyFourHoursAgo },
      deliveryTimeSeconds: { $exists: true, $ne: null },
    }).select('deliveryTimeSeconds').lean();

    let avgDeliveryTimeSeconds = 0;
    if (deliveredOrders.length > 0) {
      const totalSeconds = deliveredOrders.reduce(
        (sum, order) => sum + (order.deliveryTimeSeconds || 0),
        0
      );
      avgDeliveryTimeSeconds = Math.round(totalSeconds / deliveredOrders.length);
    }

    // Average delivery time within SLA
    const avgDeliveryTimeWithinSla = avgDeliveryTimeSeconds <= appConfig.slaThresholdSeconds;

    // SLA breaches
    const now = new Date();
    const slaBreaches = await Order.countDocuments({
      $or: [
        { status: 'delayed' },
        {
          status: { $ne: 'delivered' },
          slaDeadline: { $lt: now },
        },
      ],
    });

    return {
      activeRiders: activeRiders ?? 0,
      maxRiders: maxRiders ?? 0,
      busyRiders: busyRiders ?? 0,
      idleRiders: idleRiders ?? 0,
      activeRiderUtilizationPercent: activeRiderUtilizationPercent ?? 0,
      fleetUtilizationPercent: fleetUtilizationPercent ?? 0,
      ordersInTransit: ordersInTransit ?? 0,
      ordersInTransitChangePercent: Math.round((ordersInTransitChangePercent ?? 0) * 100) / 100,
      avgDeliveryTimeSeconds: avgDeliveryTimeSeconds ?? 0,
      avgDeliveryTimeWithinSla: Boolean(avgDeliveryTimeWithinSla),
      slaBreaches: slaBreaches ?? 0,
    };
  } catch (error) {
    logger.error('Error calculating dashboard summary:', error);
    throw error;
  }
};

module.exports = {
  getDashboardSummary,
};

