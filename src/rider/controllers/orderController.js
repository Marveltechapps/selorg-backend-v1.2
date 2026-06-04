/**
 * Rider order controller - list, assign, alert
 * Uses warehouse orderService for rider dashboard at /api/v1/rider/orders
 */
const orderService = require('../../warehouse/services/orderService');
const cache = require('../../utils/cache');
const logger = require('../../core/utils/logger');
const riderDashboardNotificationService = require('../services/riderDashboardNotificationService');

function assignErrorResponse(res, statusCode, message) {
  return res.status(statusCode).json({ success: false, message });
}

const listOrders = async (req, res, next) => {
  try {
    const { status, riderId, search, page, limit, sortBy, sortOrder } = req.query;
    const filters = { status, riderId, search };
    const pagination = { page: parseInt(page) || 1, limit: parseInt(limit) || 100 };
    const sorting = { sortBy: sortBy || 'etaMinutes', sortOrder: sortOrder || 'asc' };

    const result = await orderService.listOrders(filters, pagination, sorting);

    res.status(200).json({
      success: true,
      data: result.orders || [],
      meta: {
        total: result.total || 0,
        page: result.page || 1,
        limit: result.limit || 100,
        totalPages: result.totalPages || 0,
      },
    });
  } catch (error) {
    logger.error('Error in rider listOrders:', error);
    next(error);
  }
};

const assignOrder = async (req, res, next) => {
  try {
    const { orderId } = req.params;
    const { riderId, orderId: bodyOrderId, overrideSla = false } = req.body;
    const effectiveRiderId = riderId || req.body.rider_id;

    logger.info('[assignOrder] request', {
      orderId,
      riderId: effectiveRiderId,
      overrideSla: !!overrideSla,
      bodyKeys: req.body ? Object.keys(req.body) : [],
    });

    if (!orderId || !String(orderId).trim()) {
      return assignErrorResponse(res, 400, 'orderId is required in the URL path');
    }

    if (!effectiveRiderId || !String(effectiveRiderId).trim()) {
      return assignErrorResponse(res, 400, 'riderId is required in the request body');
    }

    const order = await orderService.assignOrder(orderId, effectiveRiderId, overrideSla);

    await cache.delByPattern('orders:*');
    await cache.delByPattern('riders:*');
    await cache.del(`rider:${effectiveRiderId}`);
    await cache.del('distribution');
    await cache.del('rider:overview:summary');

    riderDashboardNotificationService
      .notifyOrderAssigned(req, { orderId, riderName: order.rider?.name })
      .catch((err) => logger.warn('Rider dashboard notification (assign) failed', { err: err.message }));

    res.status(200).json({
      success: true,
      orderId: order.id,
      riderId: order.riderId,
      riderName: order.rider?.name,
      status: order.status,
      etaMinutes: order.etaMinutes,
    });
  } catch (error) {
    logger.error('Error in rider assignOrder:', {
      message: error.message,
      statusCode: error.statusCode,
      orderId: req.params?.orderId,
      riderId: req.body?.riderId || req.body?.rider_id,
    });
    const statusCode = error.statusCode || 500;
    const message = error.message || 'Assignment failed';

    if (statusCode === 404 || message.includes('not found')) {
      return assignErrorResponse(res, 404, message);
    }
    if (
      statusCode === 400 ||
      message.includes('cannot be assigned') ||
      message.includes('not available') ||
      message.includes('at capacity') ||
      message.includes('violate SLA') ||
      message.includes('offline') ||
      message.includes('required')
    ) {
      return assignErrorResponse(res, 400, message);
    }
    next(error);
  }
};

const alertOrder = async (req, res, next) => {
  try {
    const { orderId } = req.params;
    const { reason } = req.body;

    const result = await orderService.alertOrder(orderId, reason || 'Delayed Order Alert');

    await cache.delByPattern('orders:*');
    await cache.delByPattern('alerts:*');
    await cache.del('rider:overview:summary');

    riderDashboardNotificationService
      .notifyOrderAlert(req, { orderId, reason: reason || 'Delayed Order Alert' })
      .catch((err) => logger.warn('Rider dashboard notification (alert) failed', { err: err.message }));

    res.status(200).json(result || { success: true });
  } catch (error) {
    logger.error('Error in rider alertOrder:', error);
    if (error.message === 'Order not found') {
      return res.status(404).json({ error: 'Not Found', message: error.message });
    }
    next(error);
  }
};

module.exports = {
  listOrders,
  assignOrder,
  alertOrder,
};
