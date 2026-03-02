const reconciliationService = require('../services/reconciliationService');
const { asyncHandler } = require('../../core/middleware');
const cacheInvalidation = require('../cacheInvalidation');

class ReconciliationController {
  getReconSummary = asyncHandler(async (req, res) => {
    const { date } = req.query;
    const summary = await reconciliationService.getReconSummary(date);
    res.json({ success: true, data: summary });
  });

  getExceptions = asyncHandler(async (req, res) => {
    const { status } = req.query;
    const exceptions = await reconciliationService.getExceptions(status);
    res.json({ success: true, data: exceptions });
  });

  runReconciliation = asyncHandler(async (req, res) => {
    const { date, gateways } = req.body;
    const run = await reconciliationService.runReconciliation(date, gateways);
    await cacheInvalidation.invalidateFinance().catch(() => {});
    res.status(201).json({ success: true, data: run });
  });

  getRunStatus = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const run = await reconciliationService.getRunStatus(id);
    res.json({ success: true, data: run });
  });

  investigateException = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const exception = await reconciliationService.investigateException(id);
    await cacheInvalidation.invalidateFinance().catch(() => {});
    res.json({ success: true, data: exception });
  });

  resolveException = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { resolutionType, note } = req.body;
    const exception = await reconciliationService.resolveException(id, resolutionType, note);
    await cacheInvalidation.invalidateFinance().catch(() => {});
    res.json({ success: true, data: exception });
  });

  getGatewayDetails = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const gateway = await reconciliationService.getGatewayDetails(id);
    res.json({ success: true, data: gateway });
  });
}

module.exports = new ReconciliationController();

