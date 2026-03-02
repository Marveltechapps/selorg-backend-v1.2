const hrService = require('../services/hrService');

const getHrDashboardSummary = async (req, res, next) => {
  try {
    const summary = await hrService.getHrDashboardSummary();
    res.status(200).json(summary);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getHrDashboardSummary,
};
