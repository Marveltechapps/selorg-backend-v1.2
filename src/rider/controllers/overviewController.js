const overviewService = require('../services/overviewService');
const { getCachedOrCompute } = require('../../utils/cacheHelper');
const appConfig = require('../../config/app');

const getSummary = async (req, res, next) => {
  try {
    const cacheKey = 'rider:overview:summary';
    const { value: summary } = await getCachedOrCompute(
      cacheKey,
      appConfig.cache?.riders || 15,
      () => overviewService.getOverviewSummary(),
      res
    );
    res.status(200).json(summary);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getSummary,
};
