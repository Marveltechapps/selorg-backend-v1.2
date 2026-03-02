const refundsService = require('../services/refundsService');
const { asyncHandler } = require('../../core/middleware');
const cacheInvalidation = require('../cacheInvalidation');

class RefundsController {
  getRefundsSummary = asyncHandler(async (req, res) => {
    const summary = await refundsService.getRefundsSummary();
    res.json({ success: true, data: summary });
  });

  getRefundQueue = asyncHandler(async (req, res) => {
    const result = await refundsService.getRefundQueue(req.query);
    res.json({ success: true, data: result });
  });

  getRefundDetails = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const refund = await refundsService.getRefundDetails(id);
    res.json({ success: true, data: refund });
  });

  approveRefund = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { notes, partialAmount } = req.body;
    const refund = await refundsService.approveRefund(id, notes, partialAmount);
    await cacheInvalidation.invalidateFinance().catch(() => {});
    res.json({ success: true, data: refund });
  });

  rejectRefund = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { reason } = req.body;
    const refund = await refundsService.rejectRefund(id, reason);
    await cacheInvalidation.invalidateFinance().catch(() => {});
    res.json({ success: true, data: refund });
  });

  getChargebacks = asyncHandler(async (req, res) => {
    const chargebacks = await refundsService.getChargebacks();
    res.json({ success: true, data: chargebacks });
  });

  markCompleted = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { transactionId, notes } = req.body;
    const refund = await refundsService.markCompleted(id, transactionId, notes);
    await cacheInvalidation.invalidateFinance().catch(() => {});
    res.json({ success: true, data: refund });
  });
}

module.exports = new RefundsController();

