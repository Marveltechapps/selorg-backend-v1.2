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

    const cacheKey = `analytics:v2:rider-performance:${hashForKey(params)}`;
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

    const cacheKey = `analytics:v2:sla-adherence:${hashForKey(params)}`;
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

    const cacheKey = `analytics:v2:fleet-utilization:${hashForKey(params)}`;
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

const getDrillDown = async (req, res, next) => {
  try {
    const result = await analyticsService.getDrillDown({
      metric: req.query.metric || 'rider',
      timestamp: req.query.timestamp,
      granularity: req.query.granularity || 'day',
    });
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    if (error.statusCode === 400) {
      return res.status(400).json({ success: false, error: error.message });
    }
    next(error);
  }
};

const scheduleReport = async (req, res, next) => {
  try {
    const userId = req.user?.id || req.user?.email || 'rider_ops';
    const doc = await analyticsService.createReportSchedule(req.body, userId);
    res.status(201).json({ success: true, data: doc });
  } catch (error) {
    next(error);
  }
};

const listSchedules = async (req, res, next) => {
  try {
    const userId = req.user?.id || req.user?.email;
    const rows = await analyticsService.listReportSchedules(userId);
    res.status(200).json({ success: true, data: rows });
  } catch (error) {
    next(error);
  }
};

const getHubComparison = async (req, res, next) => {
  try {
    const data = await analyticsService.getHubComparison(req.query);
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

const getRiderLeaderboard = async (req, res, next) => {
  try {
    const data = await analyticsService.getRiderLeaderboard(req.query);
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

const getDispatchEfficiency = async (req, res, next) => {
  try {
    const data = await analyticsService.getDispatchEfficiency(req.query);
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getRiderPerformance,
  getSlaAdherence,
  getFleetUtilization,
  exportReport,
  getDrillDown,
  scheduleReport,
  listSchedules,
  getHubComparison,
  getRiderLeaderboard,
  getDispatchEfficiency,
};

