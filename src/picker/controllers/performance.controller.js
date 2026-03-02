const performanceService = require('../services/performance.service');
const { success, error } = require('../utils/response.util');

async function getSummary(req, res, next) {
  try {
    const data = await performanceService.getSummary(req.hhdUserId);
    success(res, data);
  } catch (err) {
    next(err);
  }
}

async function getHistory(req, res, next) {
  try {
    const { page, limit, from, to } = req.query;
    const result = await performanceService.getHistory(req.hhdUserId, { page, limit, from, to });
    res.status(200).json({
      success: true,
      count: result.orders.length,
      total: result.total,
      page: result.page,
      pages: result.pages,
      data: result.orders,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { getSummary, getHistory };
