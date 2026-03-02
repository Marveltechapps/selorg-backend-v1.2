const riderCashService = require('../services/riderCashService');
const { asyncHandler } = require('../../core/middleware');

class RiderCashController {
  getSummary = asyncHandler(async (req, res) => {
    try {
      const summary = await riderCashService.getRiderCashSummary();
      res.json({ success: true, data: summary });
    } catch (e) {
      if (e.message === 'Rider cash module not available') {
        return res.status(503).json({ success: false, message: 'Rider cash module not available' });
      }
      throw e;
    }
  });

  getPayouts = asyncHandler(async (req, res) => {
    try {
      const page = parseInt(req.query.page, 10) || 1;
      const pageSize = Math.min(parseInt(req.query.pageSize, 10) || 20, 100);
      const status = req.query.status;
      const result = await riderCashService.getRiderPayoutsList(page, pageSize, status);
      res.json({ success: true, data: result });
    } catch (e) {
      if (e.message === 'Rider cash module not available') {
        return res.status(503).json({ success: false, message: 'Rider cash module not available', data: { data: [], total: 0, page: 1, pageSize: 20 } });
      }
      throw e;
    }
  });

  getCodReconciliation = asyncHandler(async (req, res) => {
    try {
      const stats = await riderCashService.getCodReconciliationStats();
      res.json({ success: true, data: stats });
    } catch (e) {
      if (e.message === 'Rider cash module not available') {
        return res.status(503).json({ success: false, message: 'Rider cash module not available', data: { codCollected: 0, codDeposited: 0, codOutstanding: 0 } });
      }
      throw e;
    }
  });
}

module.exports = new RiderCashController();
