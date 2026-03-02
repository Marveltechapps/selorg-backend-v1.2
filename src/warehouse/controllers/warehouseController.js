const warehouseService = require('../services/warehouseService');
const { asyncHandler } = require('../../core/middleware');

/**
 * @desc Warehouse Overview Controller
 */
const warehouseController = {
  getMetrics: asyncHandler(async (req, res) => {
    const metrics = await warehouseService.getMetrics();
    res.status(200).json({ success: true, data: metrics });
  }),

  getOrderFlow: asyncHandler(async (req, res) => {
    const flow = await warehouseService.getOrderFlow();
    res.status(200).json({ success: true, data: flow, meta: { count: flow.length } });
  }),

  getDailyReport: asyncHandler(async (req, res) => {
    const report = await warehouseService.getDailyReport(req.query.date);
    res.status(200).json({ success: true, data: report });
  }),

  getOperationsView: asyncHandler(async (req, res) => {
    const view = await warehouseService.getOperationsView();
    res.status(200).json({ success: true, data: view });
  }),

  getAnalytics: asyncHandler(async (req, res) => {
    const analytics = await warehouseService.getAnalyticsSummary();
    res.status(200).json({ success: true, data: analytics });
  })
};

module.exports = warehouseController;

