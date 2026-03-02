/**
 * Shared orders service – Picker app reads/updates HHD orders by hhdUserId (same person).
 * Uses HHD Order, CompletedOrder and assignorders collection in the shared DB.
 */
const mongoose = require('mongoose');
const HHDOrder = require('../../hhd/models/Order.model');
const HHDCompletedOrder = require('../../hhd/models/CompletedOrder.model');
const { ORDER_STATUS } = require('../../hhd/utils/constants');

/**
 * List orders for the linked HHD user.
 * @param {ObjectId} hhdUserId
 * @param {{ status?: string, page?: number, limit?: number }} options
 */
async function getOrdersByHhdUser(hhdUserId, options = {}) {
  const { status, page = 1, limit = 20 } = options;
  const query = { userId: hhdUserId };
  if (status) query.status = status;
  const skip = (Number(page) - 1) * Number(limit);
  const [orders, total] = await Promise.all([
    HHDOrder.find(query).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)).lean(),
    HHDOrder.countDocuments(query),
  ]);
  return { orders, total, page: Number(page), pages: Math.ceil(total / Number(limit)) };
}

/**
 * Get a single order by orderId only if it belongs to hhdUserId.
 */
async function getOrderByOrderId(orderId, hhdUserId) {
  return HHDOrder.findOne({ orderId, userId: hhdUserId }).lean();
}

/**
 * List assignorders for the linked HHD user (raw collection).
 */
async function getAssignOrdersByHhdUser(hhdUserId, status) {
  const coll = mongoose.connection.collection('assignorders');
  const query = { userId: new mongoose.Types.ObjectId(hhdUserId) };
  if (status) query.status = status;
  return coll.find(query).sort({ createdAt: -1 }).toArray();
}

/**
 * List completed orders for the linked HHD user.
 */
async function getCompletedOrdersByHhdUser(hhdUserId, options = {}) {
  const { page = 1, limit = 20 } = options;
  const skip = (Number(page) - 1) * Number(limit);
  const [orders, total] = await Promise.all([
    HHDCompletedOrder.find({ userId: hhdUserId }).sort({ completedAt: -1 }).skip(skip).limit(Number(limit)).lean(),
    HHDCompletedOrder.countDocuments({ userId: hhdUserId }),
  ]);
  return { orders, total, page: Number(page), pages: Math.ceil(total / Number(limit)) };
}

/**
 * Update order status. Only if order belongs to hhdUserId.
 */
async function updateOrderStatus(orderId, hhdUserId, status, extra = {}) {
  const order = await HHDOrder.findOne({ orderId, userId: hhdUserId });
  if (!order) return null;
  if (status) order.status = status;
  if (extra.bagId) order.bagId = extra.bagId;
  if (extra.rackLocation) order.rackLocation = extra.rackLocation;
  if (extra.pickTime != null) order.pickTime = extra.pickTime;
  if (status === ORDER_STATUS.COMPLETED || status === 'completed') order.completedAt = new Date();
  await order.save();
  return order;
}

/**
 * Complete an order: create CompletedOrder, update Order and assignorders.
 * Returns { order, completedOrder } or null if not found.
 */
async function completeOrder(orderId, hhdUserId, payload = {}) {
  const order = await HHDOrder.findOne({ orderId, userId: hhdUserId });
  if (!order) return null;

  const completedAt = new Date();
  const completedDoc = {
    orderId: order.orderId,
    userId: order.userId,
    zone: order.zone,
    status: ORDER_STATUS.COMPLETED,
    itemCount: order.itemCount,
    targetTime: order.targetTime,
    pickTime: payload.pickTime != null ? payload.pickTime : order.pickTime,
    bagId: payload.bagId || order.bagId,
    rackLocation: payload.rackLocation || order.rackLocation,
    riderName: order.riderName,
    riderId: order.riderId,
    startedAt: order.startedAt,
    completedAt,
    rackAssignedAt: order.rackAssignedAt,
  };
  const completedOrder = await HHDCompletedOrder.create(completedDoc);

  order.status = ORDER_STATUS.COMPLETED;
  order.completedAt = completedAt;
  if (payload.pickTime != null) order.pickTime = payload.pickTime;
  await order.save();

  const assignColl = mongoose.connection.collection('assignorders');
  const assignOrder = await assignColl.findOne({ orderId });
  if (assignOrder && assignHHDOrder.userId?.toString() === hhdUserId.toString()) {
    await assignColl.updateOne(
      { orderId },
      { $set: { status: ORDER_STATUS.COMPLETED, completedAt, updatedAt: completedAt } }
    );
  }

  return { order, completedOrder };
}

module.exports = {
  getOrdersByHhdUser,
  getOrderByOrderId,
  getAssignOrdersByHhdUser,
  getCompletedOrdersByHhdUser,
  updateOrderStatus,
  completeOrder,
};
