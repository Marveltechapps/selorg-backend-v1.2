const financeDashboardService = require('../services/financeDashboardService');
const { asyncHandler } = require('../../core/middleware');

class FinanceDashboardController {
  getFinanceSummary = asyncHandler(async (req, res) => {
    const { entityId, date } = req.query;
    const summary = await financeDashboardService.getFinanceSummary(entityId, date);
    res.json({ success: true, data: summary });
  });

  getPaymentMethodSplit = asyncHandler(async (req, res) => {
    const { entityId, date } = req.query;
    const split = await financeDashboardService.getPaymentMethodSplit(entityId, date);
    res.json({ success: true, data: split });
  });

  getLiveTransactions = asyncHandler(async (req, res) => {
    const { entityId, limit, cursor, method } = req.query;
    const transactions = await financeDashboardService.getLiveTransactions(
      entityId,
      parseInt(limit) || 10,
      cursor,
      method
    );
    res.json({ success: true, data: transactions });
  });

  getDailyMetrics = asyncHandler(async (req, res) => {
    const { entityId, days } = req.query;
    const metrics = await financeDashboardService.getDailyMetrics(
      entityId,
      parseInt(days) || 5
    );
    res.json({ success: true, data: metrics });
  });

  getGatewayStatus = asyncHandler(async (req, res) => {
    const { entityId } = req.query;
    const status = await financeDashboardService.getGatewayStatus(entityId);
    res.json({ success: true, data: status });
  });

  getHourlyTrends = asyncHandler(async (req, res) => {
    const { entityId, date } = req.query;
    const trends = await financeDashboardService.getHourlyTrends(entityId, date);
    res.json({ success: true, data: trends });
  });

  exportFinanceReport = asyncHandler(async (req, res) => {
    const result = await financeDashboardService.exportFinanceReport(req.body);
    res.json({ success: true, data: result });
  });
}

module.exports = new FinanceDashboardController();

