const financeAlertsService = require('../services/financeAlertsService');
const { asyncHandler } = require('../../core/middleware');
const cacheInvalidation = require('../cacheInvalidation');

class FinanceAlertsController {
  getAlerts = asyncHandler(async (req, res) => {
    const { status } = req.query;
    const alerts = await financeAlertsService.getAlerts(status);
    res.json({ success: true, data: alerts });
  });

  getAlertDetails = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const alert = await financeAlertsService.getAlertDetails(id);
    if (!alert) {
      res.status(404).json({ success: false, message: 'Alert not found' });
      return;
    }
    res.json({ success: true, data: alert });
  });

  performAlertAction = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const alert = await financeAlertsService.performAlertAction(id, req.body);
    await cacheInvalidation.invalidateFinance().catch(() => {});
    res.json({ success: true, data: alert });
  });

  clearResolvedAlerts = asyncHandler(async (req, res) => {
    await financeAlertsService.clearResolvedAlerts();
    await cacheInvalidation.invalidateFinance().catch(() => {});
    res.json({ success: true, message: 'Resolved alerts cleared' });
  });
}

module.exports = new FinanceAlertsController();

