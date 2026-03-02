/**
 * Rider order controller - list, assign, alert
 * Uses warehouse orderService for rider dashboard at /api/v1/rider/orders
 */
const orderService = require('../../warehouse/services/orderService');
const cache = require('../../utils/cache');
const logger = require('../../core/utils/logger');

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

    if (!effectiveRiderId) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'riderId is required',
      });
    }

    const order = await orderService.assignOrder(orderId, effectiveRiderId, overrideSla);

    await cache.delByPattern('orders:*');
    await cache.delByPattern('riders:*');
    await cache.del(`rider:${effectiveRiderId}`);
    await cache.del('distribution');
    await cache.del('rider:overview:summary');

    res.status(200).json({
      orderId: order.id,
      riderId: order.riderId,
      riderName: order.rider?.name,
      status: order.status,
      etaMinutes: order.etaMinutes,
    });
  } catch (error) {
    logger.error('Error in rider assignOrder:', error);
    if (error.message === 'Order not found' || error.message?.includes('not found')) {
      return res.status(404).json({ error: 'Not Found', message: error.message });
    }
    if (
      error.message?.includes('cannot be assigned') ||
      error.message?.includes('not available') ||
      error.message?.includes('at capacity') ||
      error.message?.includes('violate SLA')
    ) {
      return res.status(400).json({ error: 'Bad Request', message: error.message });
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
