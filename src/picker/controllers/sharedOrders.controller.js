/**
 * Picker app: HHD orders (by linked hhdUserId). Same person uses app and HHD device.
 */
const sharedOrdersService = require('../services/sharedOrders.service');
const { success, error } = require('../utils/response.util');

async function getOrders(req, res, next) {
  try {
    const hhdUserId = req.hhdUserId;
    const { status, page, limit } = req.query;
    const result = await sharedOrdersService.getOrdersByHhdUser(hhdUserId, { status, page, limit });
    res.status(200).json({
      success: true,
      count: result.orders.length,
      total: result.total,
      page: result.page,
      pages: result.pages,
      data: result.orders,
    });
  } catch (err) {
    next(err);
  }
}

async function getOrder(req, res, next) {
  try {
    const { orderId } = req.params;
    const order = await sharedOrdersService.getOrderByOrderId(orderId, req.hhdUserId);
    if (!order) return error(res, 'Order not found', 404);
    success(res, order);
  } catch (err) {
    next(err);
  }
}

async function getAssignOrders(req, res, next) {
  try {
    const { status } = req.query;
    const orders = await sharedOrdersService.getAssignOrdersByHhdUser(req.hhdUserId, status);
    res.status(200).json({ success: true, count: orders.length, data: orders });
  } catch (err) {
    next(err);
  }
}

async function getCompletedOrders(req, res, next) {
  try {
    const { page, limit } = req.query;
    const result = await sharedOrdersService.getCompletedOrdersByHhdUser(req.hhdUserId, { page, limit });
    res.status(200).json({
      success: true,
      count: result.orders.length,
      total: result.total,
      page: result.page,
      pages: result.pages,
      data: result.orders,
    });
  } catch (err) {
    next(err);
  }
}

async function updateOrderStatus(req, res, next) {
  try {
    const { orderId } = req.params;
    const { status, bagId, rackLocation, pickTime } = req.body || {};
    const order = await sharedOrdersService.updateOrderStatus(orderId, req.hhdUserId, status, {
      bagId,
      rackLocation,
      pickTime,
    });
    if (!order) return error(res, 'Order not found', 404);
    try {
      const { getIO } = require('../../hhd/config/socket');
      getIO().emit('order:updated', { orderId, status: order.status, updatedAt: order.updatedAt });
    } catch (_) {}
    success(res, order);
  } catch (err) {
    next(err);
  }
}

async function completeOrder(req, res, next) {
  try {
    const { orderId } = req.params;
    const payload = req.body || {};
    const result = await sharedOrdersService.completeOrder(orderId, req.hhdUserId, payload);
    if (!result) return error(res, 'Order not found', 404);
    try {
      const { getIO } = require('../../hhd/config/socket');
      getIO().emit('order:updated', {
        orderId,
        status: 'completed',
        updatedAt: result.order.updatedAt,
      });
      getIO().emit('assignorder:updated', {
        orderId,
        status: 'completed',
        updatedAt: result.order.updatedAt,
      });
    } catch (_) {}
    success(res, { order: result.order, completedOrder: result.completedOrder });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getOrders,
  getOrder,
  getAssignOrders,
  getCompletedOrders,
  updateOrderStatus,
  completeOrder,
};
