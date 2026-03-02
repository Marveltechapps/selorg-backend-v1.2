const analyticsService = require('../services/analyticsService');
const cache = require('../../utils/cache');
const { getCachedOrCompute, hashForKey } = require('../../utils/cacheHelper');
const appConfig = require('../../config/app');
const logger = require('../../core/utils/logger');

/**
 * Get rider performance metrics
 */
const getRiderPerformance = async (req, res, next) => {
  try {
    const params = {
      granularity: req.query.granularity || 'day',
      dateRange: req.query.dateRange || '7d',
      startDate: req.query.startDate,
      endDate: req.query.endDate,
    };

    const cacheKey = `analytics:rider-performance:${hashForKey(params)}`;
    const { value: result } = await getCachedOrCompute(
      cacheKey,
      appConfig.cache.analytics,
      () => analyticsService.getRiderPerformance(params),
      res
    );
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

/**
 * Get SLA adherence metrics
 */
const getSlaAdherence = async (req, res, next) => {
  try {
    const params = {
      granularity: req.query.granularity || 'day',
      dateRange: req.query.dateRange || '7d',
      startDate: req.query.startDate,
      endDate: req.query.endDate,
    };

    const cacheKey = `analytics:sla-adherence:${hashForKey(params)}`;
    const { value: result } = await getCachedOrCompute(
      cacheKey,
      appConfig.cache.analytics,
      () => analyticsService.getSlaAdherence(params),
      res
    );
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

/**
 * Get fleet utilization metrics
 */
const getFleetUtilization = async (req, res, next) => {
  try {
    const params = {
      granularity: req.query.granularity || 'day',
      dateRange: req.query.dateRange || '7d',
      startDate: req.query.startDate,
      endDate: req.query.endDate,
    };

    const cacheKey = `analytics:fleet-utilization:${hashForKey(params)}`;
    const { value: result } = await getCachedOrCompute(
      cacheKey,
      appConfig.cache.analytics,
      () => analyticsService.getFleetUtilization(params),
      res
    );
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

/**
 * Export report
 */
const exportReport = async (req, res, next) => {
  try {
    const payload = req.body;

    if (!payload.metric || !payload.format || !payload.from || !payload.to) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'metric, format, from, and to are required',
        code: 'MISSING_REQUIRED_FIELDS',
      });
    }

    const result = await analyticsService.exportReport(payload);
    
    // Invalidate cache for the specific metric
    await cache.delByPattern(`analytics:${payload.metric}:*`);
    
    res.status(200).json(result);
  } catch (error) {
    logger.error('Error in exportReport controller:', error);
    next(error);
  }
};

module.exports = {
  getRiderPerformance,
  getSlaAdherence,
  getFleetUtilization,
  exportReport,
};

