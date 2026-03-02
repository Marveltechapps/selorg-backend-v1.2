const orderService = require('../services/orderService');
const cache = require('../../utils/cache');
const logger = require('../../core/utils/logger');
const cacheInvalidation = require('../cacheInvalidation');

const listOrders = async (req, res, next) => {
  try {
    const { status, riderId, search, page, limit, sortBy, sortOrder } = req.query;
    
    const filters = { status, riderId, search };
    // Enforce safe default limit per project rules (5)
    const pagination = { page: parseInt(page) || 1, limit: parseInt(limit) || 5 };
    const sorting = { sortBy: sortBy || 'etaMinutes', sortOrder: sortOrder || 'asc' };
    
    const result = await orderService.listOrders(filters, pagination, sorting);

    // Standardized response envelope (success, data, meta)
    res.status(200).json({
      success: true,
      data: result.orders || [],
      meta: {
        total: result.total || 0,
        page: result.page || 1,
        limit: result.limit || 5,
        totalPages: result.totalPages || 0,
      },
    });
  } catch (error) {
    logger.error('Error in listOrders controller:', error);
    next(error);
  }
};

const assignOrder = async (req, res, next) => {
  try {
    const { orderId } = req.params;
    const { riderId, overrideSla = false } = req.body;
    
    const order = await orderService.assignOrder(orderId, riderId, overrideSla);
    
    // Invalidate all related cache entries
    await cache.delByPattern('orders:*');
    await cache.delByPattern('riders:*');
    await cache.del(`rider:${riderId}`);
    await cache.del('distribution');
    await cache.delByPattern('dashboard:*');
    await cacheInvalidation.invalidateWarehouse().catch(() => {});
    
    res.status(200).json(order);
  } catch (error) {
    logger.error('Error in assignOrder controller:', error);
    if (error.message === 'Order not found' || error.message === 'Rider not found') {
      return res.status(404).json({
        error: 'Not Found',
        message: error.message,
        code: 404,
      });
    }
    if (
      error.message === 'Order cannot be assigned in current status' ||
      error.message === 'Rider is not available for assignment' ||
      error.message === 'Rider is at capacity' ||
      error.message === 'Assignment would violate SLA deadline'
    ) {
      return res.status(400).json({
        error: 'Bad Request',
        message: error.message,
        code: 400,
      });
    }
    next(error);
  }
};

const alertOrder = async (req, res, next) => {
  try {
    const { orderId } = req.params;
    const { reason } = req.body;
    
    const result = await orderService.alertOrder(orderId, reason);
    
    // Invalidate cache
    await cache.delByPattern('orders:*');
    await cache.delByPattern('alerts:*');
    await cacheInvalidation.invalidateWarehouse().catch(() => {});
    
    res.status(200).json(result);
  } catch (error) {
    logger.error('Error in alertOrder controller:', error);
    if (error.message === 'Order not found') {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Order not found',
        code: 404,
      });
    }
    next(error);
  }
};

module.exports = {
  listOrders,
  assignOrder,
  alertOrder,
};

