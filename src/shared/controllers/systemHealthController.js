const systemHealthService = require('../services/systemHealthService');
const cache = require('../../utils/cache');
const { getCachedOrCompute, hashForKey } = require('../../utils/cacheHelper');
const appConfig = require('../../config/app');
const logger = require('../../core/utils/logger');

/**
 * Get system health summary
 */
const getSystemHealthSummary = async (req, res, next) => {
  try {
    const { value: summary } = await getCachedOrCompute(
      'system-health:summary',
      appConfig.cache.systemHealth,
      () => systemHealthService.getSystemHealthSummary(),
      res
    );
    res.status(200).json(summary);
  } catch (error) {
    next(error);
  }
};

/**
 * List device health logs
 */
const listDeviceHealth = async (req, res, next) => {
  try {
    const filters = {
      status: req.query.status,
      riderId: req.query.riderId,
      search: req.query.search,
      page: parseInt(req.query.page) || 1,
      limit: parseInt(req.query.limit) || 50,
    };

    const cacheKey = `system-health:devices:${hashForKey(filters)}`;
    const { value: result } = await getCachedOrCompute(
      cacheKey,
      appConfig.cache.systemHealth,
      () => systemHealthService.listDeviceHealth(filters),
      res
    );
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

/**
 * Get device health by ID
 */
const getDeviceHealthById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const cacheKey = `system-health:devices:${id}`;
    const { value: device } = await getCachedOrCompute(
      cacheKey,
      appConfig.cache.systemHealth,
      () => systemHealthService.getDeviceHealthById(id),
      res
    );
    res.status(200).json(device);
  } catch (error) {
    if (error.message === 'Device not found') {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Device not found',
        code: 'DEVICE_NOT_FOUND',
      });
    }
    next(error);
  }
};

/**
 * Run system diagnostics
 */
const runDiagnostics = async (req, res, next) => {
  try {
    const options = {
      scope: req.body.scope || 'full',
      deviceIds: req.body.deviceIds || [],
    };

    const report = await systemHealthService.runDiagnostics(options);
    
    // Invalidate cache
    await cache.delByPattern('system-health:*');
    await cache.del('system-health:summary');
    
    res.status(202).json({
      message: 'System diagnostics initiated',
      reportId: report.reportId,
    });
  } catch (error) {
    logger.error('Error in runDiagnostics controller:', error);
    next(error);
  }
};

/**
 * Get diagnostics report
 */
const getDiagnosticsReport = async (req, res, next) => {
  try {
    const { reportId } = req.params;
    const report = await systemHealthService.getDiagnosticsReport(reportId);
    res.status(200).json(report);
  } catch (error) {
    if (error.message === 'Diagnostics report not found') {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Diagnostics report not found',
        code: 'REPORT_NOT_FOUND',
      });
    }
    next(error);
  }
};

module.exports = {
  getSystemHealthSummary,
  listDeviceHealth,
  getDeviceHealthById,
  runDiagnostics,
  getDiagnosticsReport,
};

