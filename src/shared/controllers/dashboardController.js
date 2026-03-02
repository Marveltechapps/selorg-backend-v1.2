const dashboardService = require('../services/dashboardService');
const { getCachedOrCompute } = require('../../utils/cacheHelper');
const appConfig = require('../../config/app');

const getDashboardSummary = async (req, res, next) => {
  try {
    const storeId = req.query.storeId || req.headers['x-store-id'] || '';
    const cacheKey = storeId ? `dashboard:summary:${storeId}` : 'dashboard:summary';
    const { value: summary } = await getCachedOrCompute(
      cacheKey,
      appConfig.cache.dashboard,
      () => dashboardService.getDashboardSummary(),
      res
    );
    res.status(200).json(summary);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getDashboardSummary,
};

