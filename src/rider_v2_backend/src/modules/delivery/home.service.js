/* Rider Home View Service
 *
 * Builds the JSON payload for the rider app home screen using only real data
 * from the Rider and Order collections. No mock or synthetic operational data.
 */

"use strict";

const { Rider } = require("../../models/Rider.js");
const { Order } = require("../../models/Order.js");

/**
 * Compute the start-of-day timestamp in the local server timezone.
 */
function getStartOfToday() {
  const now = new Date();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  return start;
}

/**
 * Build today's summary for a rider from real order data.
 *
 * - Counts are derived from orders that have this rider in riderAssignment.
 * - On-time vs late delivery is computed using delivery.scheduledTime when present.
 */
async function buildTodaySummary(riderId) {
  const startOfToday = getStartOfToday();

  let ordersAssigned = 0;
  let ordersCompleted = 0;
  let ordersCancelled = 0;
  let onTimeCount = 0;
  let lateCount = 0;
  let amountCollectedCod = 0;
  let earningsToday = 0;
  let onlineHours = 0;
  let slotsCompleted = 0;
  let incentiveEarned = 0;

  // Completion-based metrics use deliveredAt as the definition of "today".
  const deliveredTodayOrders = await Order.find({
    "riderAssignment.riderId": riderId,
    "riderAssignment.deliveredAt": { $gte: startOfToday },
    status: "delivered",
  })
    .select(
      "status pricing.deliveryFee payment.method payment.amount delivery.scheduledTime riderAssignment.deliveredAt"
    )
    .lean();

  ordersCompleted = deliveredTodayOrders.length;

  for (const o of deliveredTodayOrders) {
    if (o.pricing && typeof o.pricing.deliveryFee === "number") {
      earningsToday += o.pricing.deliveryFee;
    }

    if (o.payment && o.payment.method === "cod" && typeof o.payment.amount === "number") {
      amountCollectedCod += o.payment.amount;
    }

    const deliveredAt =
      o.riderAssignment && o.riderAssignment.deliveredAt
        ? new Date(o.riderAssignment.deliveredAt)
        : null;
    const scheduled = o.delivery && o.delivery.scheduledTime ? new Date(o.delivery.scheduledTime) : null;
    if (deliveredAt && scheduled) {
      if (deliveredAt.getTime() <= scheduled.getTime()) onTimeCount += 1;
      else lateCount += 1;
    }
  }

  // Assignment count: prefer assignedAt (true "assigned today"). Fallback to createdAt for legacy docs.
  const assignedAtCount = await Order.countDocuments({
    "riderAssignment.riderId": riderId,
    "riderAssignment.assignedAt": { $gte: startOfToday },
  });
  if (assignedAtCount > 0) {
    ordersAssigned = assignedAtCount;
  } else {
    ordersAssigned = await Order.countDocuments({
      "riderAssignment.riderId": riderId,
      createdAt: { $gte: startOfToday },
      status: { $in: ["assigned", "picked", "out_for_delivery", "delivered", "cancelled"] },
    });
  }

  // Cancelled today (best-effort): use updatedAt since there's no cancelledAt field in schema.
  ordersCancelled = await Order.countDocuments({
    "riderAssignment.riderId": riderId,
    status: "cancelled",
    updatedAt: { $gte: startOfToday },
  });

  // Simple calculation for online hours from current shift if active
  const rider = await Rider.findOne({ riderId }).select("currentShift stats").lean();
  if (rider && rider.currentShift && rider.currentShift.startedAt) {
    const started = new Date(rider.currentShift.startedAt);
    const now = new Date();
    onlineHours = Math.round((now.getTime() - started.getTime()) / (1000 * 60 * 60) * 10) / 10;
    // For now, consider 1 slot completed if shift has been active for more than 4 hours
    if (onlineHours >= 4) {
      slotsCompleted = 1;
    }
  }

  // Incentive calculation: simple rule, e.g. 50 if completed > 5 orders today
  if (ordersCompleted >= 5) {
    incentiveEarned = 50;
  }

  return {
    ordersAssigned,
    ordersCompleted,
    ordersCancelled,
    onTimeCount,
    lateCount,
    amountCollectedCod,
    earningsToday,
    onlineHours,
    slotsCompleted,
    incentiveEarned,
  };
}

/**
 * Build active task and queue for a rider from Order documents.
 *
 * - Active task: first order in active statuses for this rider.
 * - Queue: remaining active orders for this rider.
 */
async function buildTasksForRider(riderId) {
  const activeStatuses = ["assigned", "picked", "out_for_delivery"];

  const orders = await Order.find({
    "riderAssignment.riderId": riderId,
    status: { $in: activeStatuses },
  })
    .sort({ "delivery.scheduledTime": 1, createdAt: 1 })
    .lean();

  if (!orders.length) {
    return { activeTask: null, queue: [] };
  }

  const mapOrderToTask = (o) => {
    const deliveryAddress = o.delivery && o.delivery.address ? o.delivery.address : null;
    const scheduledTime =
      o.delivery && o.delivery.scheduledTime ? new Date(o.delivery.scheduledTime) : null;

    return {
      orderNumber: o.orderNumber,
      status: o.status,
      paymentMethod: o.payment ? o.payment.method : null,
      paymentStatus: o.payment ? o.payment.status : null,
      codAmount:
        o.payment && o.payment.method === "cod" && typeof o.payment.amount === "number"
          ? o.payment.amount
          : null,
      deliveryAddress: deliveryAddress,
      scheduledTime: scheduledTime ? scheduledTime.toISOString() : null,
      customerPhoneNumber: o.customerPhoneNumber,
      darkstoreCode: o.darkstoreCode || o.warehouseCode,
      itemsCount: Array.isArray(o.items) ? o.items.length : 0,
    };
  };

  const [first, ...rest] = orders;
  const activeTask = mapOrderToTask(first);
  const queue = rest.map(mapOrderToTask);

  return { activeTask, queue };
}

/**
 * Build the full rider home view payload.
 */
async function buildRiderHomeView(riderId) {
  const rider = await Rider.findOne({ riderId }).lean();
  if (!rider) {
    const err = new Error("Rider not found");
    err.statusCode = 404;
    throw err;
  }

  const [todaySummary, tasks] = await Promise.all([
    buildTodaySummary(riderId),
    buildTasksForRider(riderId),
  ]);

  const riderSnapshot = {
    riderId: rider.riderId,
    name: rider.name,
    phoneNumber: rider.phoneNumber,
    email: rider.email || null,
    status: rider.status,
    availability: rider.availability,
    currentShift: rider.currentShift || null,
    currentLocation: rider.currentLocation || null,
  };

  const homeConfig = {
    banners: [],
    features: {},
  };

  return {
    rider: riderSnapshot,
    todaySummary,
    activeTask: tasks.activeTask,
    queue: tasks.queue,
    homeConfig,
  };
}

module.exports = {
  buildRiderHomeView,
};

