const financeService = require('../services/financeService');
const { asyncHandler } = require('../../core/middleware');

class FinanceController {
  getTaxRules = asyncHandler(async (req, res) => {
    const rules = await financeService.getTaxRules();
    res.json({ success: true, data: rules });
  });

  createTaxRule = asyncHandler(async (req, res) => {
    const rule = await financeService.createTaxRule(req.body);
    res.status(201).json({ success: true, message: 'Tax rule created', data: rule });
  });

  updateTaxRule = asyncHandler(async (req, res) => {
    const { ruleId } = req.params;
    const rule = await financeService.updateTaxRule(ruleId, req.body);
    if (!rule) {
      res.status(404).json({ success: false, message: 'Tax rule not found' });
      return;
    }
    res.json({ success: true, message: 'Tax rule updated', data: rule });
  });

  getCommissionSlabs = asyncHandler(async (req, res) => {
    const slabs = await financeService.getCommissionSlabs();
    res.json({ success: true, data: slabs });
  });

  createCommissionSlab = asyncHandler(async (req, res) => {
    const slab = await financeService.createCommissionSlab(req.body);
    res.status(201).json({ success: true, message: 'Commission slab created', data: slab });
  });

  updateCommissionSlab = asyncHandler(async (req, res) => {
    const { slabId } = req.params;
    const slab = await financeService.updateCommissionSlab(slabId, req.body);
    if (!slab) {
      res.status(404).json({ success: false, message: 'Commission slab not found' });
      return;
    }
    res.json({ success: true, message: 'Commission slab updated', data: slab });
  });

  getPayoutSchedules = asyncHandler(async (req, res) => {
    const schedules = await financeService.getPayoutSchedules();
    res.json({ success: true, data: schedules });
  });

  createPayoutSchedule = asyncHandler(async (req, res) => {
    const schedule = await financeService.createPayoutSchedule(req.body);
    res.status(201).json({ success: true, message: 'Payout schedule created', data: schedule });
  });

  updatePayoutSchedule = asyncHandler(async (req, res) => {
    const { scheduleId } = req.params;
    const schedule = await financeService.updatePayoutSchedule(scheduleId, req.body);
    if (!schedule) {
      res.status(404).json({ success: false, message: 'Payout schedule not found' });
      return;
    }
    res.json({ success: true, message: 'Payout schedule updated', data: schedule });
  });

  getRefundPolicies = asyncHandler(async (req, res) => {
    const policies = await financeService.getRefundPolicies();
    res.json({ success: true, data: policies });
  });

  updateRefundPolicy = asyncHandler(async (req, res) => {
    const { policyId } = req.params;
    const policy = await financeService.updateRefundPolicy(policyId, req.body);
    if (!policy) {
      res.status(404).json({ success: false, message: 'Refund policy not found' });
      return;
    }
    res.json({ success: true, message: 'Refund policy updated', data: policy });
  });

  getReconciliationRules = asyncHandler(async (req, res) => {
    const rules = await financeService.getReconciliationRules();
    res.json({ success: true, data: rules });
  });

  updateReconciliationRule = asyncHandler(async (req, res) => {
    const { ruleId } = req.params;
    const rule = await financeService.updateReconciliationRule(ruleId, req.body);
    res.json({ success: true, message: 'Reconciliation rule updated', data: rule });
  });

  getInvoiceSettings = asyncHandler(async (req, res) => {
    const settings = await financeService.getInvoiceSettings();
    res.json({ success: true, data: settings });
  });

  updateInvoiceSettings = asyncHandler(async (req, res) => {
    const settings = await financeService.updateInvoiceSettings(req.body);
    res.json({ success: true, message: 'Invoice settings updated', data: settings });
  });

  getPaymentTerms = asyncHandler(async (req, res) => {
    const terms = await financeService.getPaymentTerms();
    res.json({ success: true, data: terms });
  });

  updatePaymentTerm = asyncHandler(async (req, res) => {
    const { termId } = req.params;
    const term = await financeService.updatePaymentTerm(termId, req.body);
    res.json({ success: true, message: 'Payment term updated', data: term });
  });

  getFinancialLimits = asyncHandler(async (req, res) => {
    const limits = await financeService.getFinancialLimits();
    res.json({ success: true, data: limits });
  });

  updateFinancialLimit = asyncHandler(async (req, res) => {
    const { limitId } = req.params;
    const limit = await financeService.updateFinancialLimit(limitId, req.body);
    res.json({ success: true, message: 'Financial limit updated', data: limit });
  });

  getFinancialYear = asyncHandler(async (req, res) => {
    const year = await financeService.getFinancialYear();
    res.json({ success: true, data: year });
  });

  updateFinancialYear = asyncHandler(async (req, res) => {
    const year = await financeService.updateFinancialYear(req.body);
    res.json({ success: true, message: 'Financial year updated', data: year });
  });
}

module.exports = new FinanceController();

