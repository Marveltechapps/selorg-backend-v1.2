const financeAnalyticsService = require('../services/financeAnalyticsService');
const { asyncHandler } = require('../../core/middleware');

class FinanceAnalyticsController {
  getRevenueGrowth = asyncHandler(async (req, res) => {
    const { from, to, granularity } = req.query;
    const data = await financeAnalyticsService.getRevenueGrowth(from, to, granularity);
    res.json({ success: true, data });
  });

  getCashFlow = asyncHandler(async (req, res) => {
    const { from, to, granularity } = req.query;
    const data = await financeAnalyticsService.getCashFlow(from, to, granularity);
    res.json({ success: true, data });
  });

  getExpenseBreakdown = asyncHandler(async (req, res) => {
    const { from, to, granularity } = req.query;
    const data = await financeAnalyticsService.getExpenseBreakdown(from, to, granularity);
    res.json({ success: true, data });
  });

  exportAnalyticsReport = asyncHandler(async (req, res) => {
    const result = await financeAnalyticsService.exportAnalyticsReport(req.body);
    res.json({ success: true, data: result });
  });
}

module.exports = new FinanceAnalyticsController();

