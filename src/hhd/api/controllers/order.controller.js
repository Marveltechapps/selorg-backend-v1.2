const { ErrorResponse } = require('../../utils/ErrorResponse');
const HHDOrder = require('../../models/Order.model');
const HHDCompletedOrder = require('../../models/CompletedOrder.model');
const HHDItem = require('../../models/Item.model');
const { ORDER_STATUS, ORDER_PRIORITY } = require('../../utils/constants');
const { emitOrderUpdate, emitNewOrder } = require('../../services/socket.service');
const { getIO } = require('../../config/socket');
const mongoose = require('mongoose');

async function getOrders(req, res, next) {
  try {
    const { status, page = 1, limit = 10 } = req.query;
    const userId = req.user?.id;
    const query = { userId };
    if (status) query.status = status;
    const skip = (Number(page) - 1) * Number(limit);
    const orders = await HHDOrder.find(query).sort({ createdAt: -1 }).skip(skip).limit(Number(limit));
    const total = await HHDOrder.countDocuments(query);
    res.status(200).json({
      success: true,
      count: orders.length,
      total,
      page: Number(page),
      pages: Math.ceil(total / Number(limit)),
      data: orders,
    });
  } catch (error) {
    next(error);
  }
}

async function getOrder(req, res, next) {
  try {
    const { orderId } = req.params;
    const userId = req.user?.id;
    let order = await HHDOrder.findOne({ orderId, userId });
    if (!order) order = await HHDOrder.findOne({ orderId });
    const items = await HHDItem.find({ orderId });
    if (!order && items.length === 0) {
      throw new ErrorResponse(`Order not found with id of ${orderId}`, 404);
    }
    res.status(200).json({ success: true, data: { order: order || null, items } });
  } catch (error) {
    next(error);
  }
}

async function createOrder(req, res, next) {
  try {
    const userId = req.user?.id;
    const { orderId, zone, itemCount, targetTime, priority, items } = req.body;
    const existingOrder = await HHDOrder.findOne({ orderId });
    if (existingOrder) throw new ErrorResponse(`Order ${orderId} already exists`, 400);
    const order = await HHDOrder.create({
      orderId,
      userId,
      zone,
      itemCount,
      targetTime,
      priority: priority && Object.values(ORDER_PRIORITY).includes(priority) ? priority : ORDER_PRIORITY.HIGH,
      status: ORDER_STATUS.RECEIVED,
      startedAt: new Date(),
    });
    if (items && Array.isArray(items)) {
      await HHDItem.insertMany(items.map((item) => ({ orderId, ...item })));
    }
    emitNewOrder(userId, order);
    res.status(201).json({ success: true, data: order });
  } catch (error) {
    next(error);
  }
}

async function updateOrderStatus(req, res, next) {
  try {
    const { orderId } = req.params;
    const { status, bagId, rackLocation, riderName, riderId, pickTime, priority } = req.body;
    const userId = req.user?.id;
    const order = await HHDOrder.findOne({ orderId, userId });
    if (!order) throw new ErrorResponse(`Order not found with id of ${orderId}`, 404);
    if (status) order.status = status;
    if (bagId) order.bagId = bagId;
    if (rackLocation) order.rackLocation = rackLocation;
    if (riderName) order.riderName = riderName;
    if (riderId) order.riderId = riderId;
    if (pickTime) order.pickTime = pickTime;
    if (priority && Object.values(ORDER_PRIORITY).includes(priority)) order.priority = priority;
    if (status === ORDER_STATUS.PICKING && !order.startedAt) order.startedAt = new Date();
    if (status === ORDER_STATUS.COMPLETED) order.completedAt = new Date();
    await order.save();
    emitOrderUpdate(orderId, { orderId, status: order.status, updatedAt: order.updatedAt });
    res.status(200).json({ success: true, data: order });
  } catch (error) {
    next(error);
  }
}

async function getOrdersByStatus(req, res, next) {
  try {
    const { status } = req.params;
    const userId = req.user?.id;
    if (!userId) return next(new ErrorResponse('User ID is required', 401));
    const orders = await HHDOrder.find({ userId, status }).sort({ createdAt: -1 });
    res.status(200).json({ success: true, count: orders.length, data: orders });
  } catch (error) {
    next(error);
  }
}

async function getAssignOrdersByStatus(req, res, next) {
  try {
    const { status } = req.params;
    const userId = req.user?.id;
    if (!userId) return next(new ErrorResponse('User ID is required', 401));
    const assignOrdersCollection = mongoose.connection.collection('assignorders');
    const orders = await assignOrdersCollection
      .find({ status, userId: new mongoose.Types.ObjectId(userId) })
      .sort({ createdAt: -1 })
      .toArray();
    res.status(200).json({ success: true, count: orders.length, data: orders });
  } catch (error) {
    next(error);
  }
}

async function updateAssignOrderStatus(req, res, next) {
  try {
    const { orderId } = req.params;
    const { status } = req.body;
    if (!status) throw new ErrorResponse('Status is required', 400);
    const assignOrdersCollection = mongoose.connection.collection('assignorders');
    const order = await assignOrdersCollection.findOne({ orderId });
    if (!order) throw new ErrorResponse(`AssignOrder not found with id of ${orderId}`, 404);
    const updateData = { status, updatedAt: new Date() };
    if (status === ORDER_STATUS.COMPLETED || status === 'completed') updateData.completedAt = new Date();
    await assignOrdersCollection.updateOne({ orderId }, { $set: updateData });
    const updatedOrder = await assignOrdersCollection.findOne({ orderId });
    emitOrderUpdate(orderId, { orderId, status: updateData.status, updatedAt: updateData.updatedAt });
    const io = getIO();
    io.emit('assignorder:updated', { orderId, status: updateData.status, updatedAt: updateData.updatedAt });
    res.status(200).json({ success: true, data: updatedOrder, message: `AssignOrder status updated to ${status}` });
  } catch (error) {
    next(error);
  }
}

async function getCompletedOrders(req, res, next) {
  try {
    const userId = req.user?.id;
    if (!userId) return next(new ErrorResponse('User ID is required', 401));
    const completedOrders = await HHDCompletedOrder.find({ userId }).sort({ completedAt: -1 }).exec();
    res.status(200).json({ success: true, count: completedOrders.length, data: completedOrders });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getOrders,
  getOrder,
  createOrder,
  updateOrderStatus,
  getOrdersByStatus,
  getAssignOrdersByStatus,
  updateAssignOrderStatus,
  getCompletedOrders,
};
