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

  const match = {
    "riderAssignment.riderId": riderId,
    createdAt: { $gte: startOfToday },
  };

  const orders = await Order.find(match)
    .select(
      "status payment.method payment.amount delivery.scheduledTime riderAssignment.deliveredAt"
    )
    .lean();

  let ordersAssigned = 0;
  let ordersCompleted = 0;
  let ordersCancelled = 0;
  let onTimeCount = 0;
  let lateCount = 0;
  let amountCollectedCod = 0;

  for (const o of orders) {
    if (o.status === "assigned" || o.status === "out_for_delivery" || o.status === "picked") {
      ordersAssigned += 1;
    }
    if (o.status === "delivered") {
      ordersCompleted += 1;
    }
    if (o.status === "cancelled") {
      ordersCancelled += 1;
    }

    const deliveredAt = o.riderAssignment && o.riderAssignment.deliveredAt
      ? new Date(o.riderAssignment.deliveredAt)
      : null;
    const scheduled =
      o.delivery && o.delivery.scheduledTime ? new Date(o.delivery.scheduledTime) : null;

    if (deliveredAt && scheduled) {
      if (deliveredAt.getTime() <= scheduled.getTime()) {
        onTimeCount += 1;
      } else {
        lateCount += 1;
      }
    }

    if (
      o.payment &&
      o.payment.method === "cod" &&
      typeof o.payment.amount === "number"
    ) {
      amountCollectedCod += o.payment.amount;
    }
  }

  return {
    ordersAssigned,
    ordersCompleted,
    ordersCancelled,
    onTimeCount,
    lateCount,
    amountCollectedCod,
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
      warehouseCode: o.warehouseCode,
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

