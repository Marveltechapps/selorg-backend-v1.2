const dispatchService = require('../services/dispatchService');
const riderDashboardNotificationService = require('../services/riderDashboardNotificationService');
const cache = require('../../utils/cache');
const logger = require('../../core/utils/logger');

/**
 * List unassigned orders
 */
const listUnassignedOrders = async (req, res, next) => {
  try {
    const filters = {
      priority: req.query.priority || 'all',
      zone: req.query.zone,
      search: req.query.search,
      sortBy: req.query.sortBy || 'priority',
      sortOrder: req.query.sortOrder || 'asc',
      page: parseInt(req.query.page) || 1,
      limit: parseInt(req.query.limit) || 50,
    };

    const result = await dispatchService.listUnassignedOrders(filters);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

/**
 * Get unassigned orders count
 */
const getUnassignedOrdersCount = async (req, res, next) => {
  try {
    const priority = req.query.priority || 'all';
    const result = await dispatchService.getUnassignedOrdersCount(priority);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

/**
 * Get map data
 */
const getMapData = async (req, res, next) => {
  try {
    const filters = {
      hubId: req.query.hubId,
      showRiders: req.query.showRiders !== 'false',
      showOrders: req.query.showOrders !== 'false',
      showPickupPoints: req.query.showPickupPoints !== 'false',
    };

    const result = await dispatchService.getMapData(filters);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

/**
 * Get map riders
 */
const getMapRiders = async (req, res, next) => {
  try {
    const filters = {
      status: req.query.status,
      zone: req.query.zone,
    };

    const result = await dispatchService.getMapRiders(filters);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

/**
 * Get map orders
 */
const getMapOrders = async (req, res, next) => {
  try {
    const filters = {
      status: req.query.status,
      zone: req.query.zone,
    };

    const result = await dispatchService.getMapOrders(filters);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

/**
 * Get recommended riders for order
 */
const getRecommendedRiders = async (req, res, next) => {
  try {
    const { orderId } = req.params;
    const filters = {
      search: req.query.search,
      limit: parseInt(req.query.limit) || 20,
    };

    const result = await dispatchService.getRecommendedRiders(orderId, filters);
    res.status(200).json(result);
  } catch (error) {
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

/**
 * Get order assignment details
 */
const getOrderAssignmentDetails = async (req, res, next) => {
  try {
    const { orderId } = req.params;
    const result = await dispatchService.getOrderAssignmentDetails(orderId);
    res.status(200).json(result);
  } catch (error) {
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

/**
 * Manually assign order to rider
 */
const assignOrder = async (req, res, next) => {
  try {
    const { orderId, riderId, overrideSla } = req.body;

    if (!orderId || !riderId) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'orderId and riderId are required',
        code: 400,
      });
    }

    const result = await dispatchService.assignOrder(orderId, riderId, overrideSla || false);
    
    // Invalidate all related cache entries
    await cache.delByPattern('orders:*');
    await cache.delByPattern('riders:*');
    await cache.del(`rider:${riderId}`);
    await cache.del('distribution');
    await cache.delByPattern('dashboard:*');
    await cache.delByPattern('dispatch:*');

    riderDashboardNotificationService
      .notifyOrderAssigned(req, {
        orderId: result.orderId,
        riderName: result.riderName,
      })
      .catch((err) => logger.warn('Rider dashboard notification (dispatch assign) failed', { err: err.message }));

    res.status(200).json(result);
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
      error.message === 'Order is not pending' ||
      error.message === 'Rider is at capacity' ||
      error.message === 'Rider is not available for assignment' ||
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

/**
 * Batch assign multiple orders
 */
const batchAssignOrders = async (req, res, next) => {
  try {
    const { orderIds } = req.body;
    
    if (!orderIds || !Array.isArray(orderIds) || orderIds.length === 0) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'orderIds array is required and must not be empty',
        code: 400,
      });
    }
    
    const result = await dispatchService.batchAssignOrders(orderIds);
    
    // Invalidate all related cache entries
    await cache.delByPattern('orders:*');
    await cache.delByPattern('riders:*');
    await cache.delByPattern('distribution');
    await cache.delByPattern('dashboard:*');
    await cache.delByPattern('dispatch:*');
    
    res.status(200).json(result);
  } catch (error) {
    logger.error('Error in batchAssignOrders controller:', error);
    next(error);
  }
};

/**
 * Auto-assign orders (legacy endpoint)
 */
const autoAssignOrders = async (req, res, next) => {
  try {
    const { orderIds } = req.body;
    const result = await dispatchService.autoAssignOrders(orderIds || []);
    
    // Invalidate all related cache entries
    await cache.delByPattern('orders:*');
    await cache.delByPattern('riders:*');
    await cache.delByPattern('distribution');
    await cache.delByPattern('dashboard:*');
    await cache.delByPattern('dispatch:*');
    
    res.status(200).json(result);
  } catch (error) {
    logger.error('Error in autoAssignOrders controller:', error);
    next(error);
  }
};

/**
 * Create manual order (phone orders, re-dispatch)
 */
const createManualOrder = async (req, res, next) => {
  try {
    const payload = req.body;
    const result = await dispatchService.createManualOrder(payload);

    await cache.delByPattern('orders:*');
    await cache.delByPattern('riders:*');
    await cache.del('distribution');
    await cache.delByPattern('dashboard:*');
    await cache.delByPattern('dispatch:*');

    res.status(201).json(result);
  } catch (error) {
    logger.error('Error in createManualOrder controller:', error);
    if (error.message === 'Order must have at least one item' ||
        error.message === 'Customer address (drop location) is required' ||
        error.message === 'Customer name is required') {
      return res.status(400).json({
        error: 'Bad Request',
        message: error.message,
        code: 400,
      });
    }
    next(error);
  }
};

/**
 * Get auto-assign rules
 */
const getAutoAssignRules = async (req, res, next) => {
  try {
    const rules = await dispatchService.getAutoAssignRules();
    res.status(200).json(rules);
  } catch (error) {
    logger.error('Error in getAutoAssignRules controller:', error);
    next(error);
  }
};

/**
 * Update auto-assign rule
 */
const updateAutoAssignRule = async (req, res, next) => {
  try {
    const rule = req.body;
    const result = await dispatchService.updateAutoAssignRule(rule);
    res.status(200).json(result);
  } catch (error) {
    logger.error('Error in updateAutoAssignRule controller:', error);
    next(error);
  }
};

/**
 * Group orders into clusters based on distance
 */
const groupOrders = async (req, res, next) => {
  try {
    const filters = {
      status: req.query.status, // Can be 'all', 'pending', etc.
      radius: parseFloat(req.query.radius) || 2,
      minSize: parseInt(req.query.minSize) || 2,
      maxSize: parseInt(req.query.maxSize) || 10,
    };

    const result = await dispatchService.groupOrders(filters);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

/**
 * Save clusters to backend
 */
const saveClusters = async (req, res, next) => {
  try {
    const { clusters } = req.body;
    if (!clusters || !Array.isArray(clusters)) {
      return res.status(400).json({ error: 'Clusters array is required' });
    }
    
    const result = await dispatchService.saveClusters(clusters);
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
};

/**
 * List saved clusters
 */
const listClusters = async (req, res, next) => {
  try {
    const filters = {
      status: req.query.status,
      zone: req.query.zone,
    };
    
    const result = await dispatchService.listClusters(filters);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

/**
 * Delete a cluster
 */
const deleteCluster = async (req, res, next) => {
  try {
    const { clusterId } = req.params;
    const result = await dispatchService.deleteCluster(clusterId);
    
    if (!result) {
      return res.status(404).json({ error: 'Cluster not found' });
    }
    
    res.status(200).json({ message: 'Cluster deleted successfully' });
  } catch (error) {
    next(error);
  }
};

/**
 * Assign a cluster to a rider
 */
const assignCluster = async (req, res, next) => {
  try {
    const { clusterId } = req.params;
    const { riderId } = req.body;
    
    if (!riderId) {
      return res.status(400).json({ error: 'riderId is required' });
    }
    
    const result = await dispatchService.assignClusterToRider(clusterId, riderId);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  listUnassignedOrders,
  getUnassignedOrdersCount,
  getMapData,
  getMapRiders,
  getMapOrders,
  getRecommendedRiders,
  getOrderAssignmentDetails,
  assignOrder,
  batchAssignOrders,
  autoAssignOrders,
  createManualOrder,
  getAutoAssignRules,
  updateAutoAssignRule,
  groupOrders,
  saveClusters,
  listClusters,
  deleteCluster,
  assignCluster,
};
