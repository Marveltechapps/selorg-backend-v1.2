const financeService = require('../services/financeService');
const { asyncHandler } = require('../../core/middleware');
const PickerUser = require('../../picker/models/user.model');
const Transaction = require('../../picker/models/transaction.model');
const walletService = require('../../picker/services/wallet.service');

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

  getPickerEarningsBreakdown = asyncHandler(async (req, res) => {
    const pickerId = req.params.pickerId;
    const picker = await PickerUser.findById(pickerId).select('_id').lean();
    if (!picker) {
      res.status(404).json({ success: false, message: 'Picker not found' });
      return;
    }
    const data = await walletService.getEarningsBreakdown(picker._id);
    res.json({ success: true, data });
  });

  getPickerWalletBalance = asyncHandler(async (req, res) => {
    const pickerId = req.params.pickerId;
    const picker = await PickerUser.findById(pickerId).select('_id').lean();
    if (!picker) {
      res.status(404).json({ success: false, message: 'Picker not found' });
      return;
    }
    const data = await walletService.getBalance(picker._id);
    res.json({ success: true, data });
  });

  listAllPickerTransactions = asyncHandler(async (req, res) => {
    const {
      search = '',
      startDate,
      endDate,
      type,
      page = 1,
      limit = 20,
    } = req.query;
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const query = {};
    if (type) query.type = type;
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }

    const pickerFilter = {};
    if (String(search).trim()) {
      const rx = new RegExp(String(search).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      pickerFilter.$or = [{ name: rx }, { phone: rx }];
    }
    const pickerUsers = await PickerUser.find(pickerFilter).select('_id name phone').lean();
    query.userId = { $in: pickerUsers.map((picker) => picker._id) };

    const [rows, total] = await Promise.all([
      Transaction.find(query).sort({ createdAt: -1 }).skip((pageNum - 1) * limitNum).limit(limitNum).lean(),
      Transaction.countDocuments(query),
    ]);
    const pickerById = Object.fromEntries(pickerUsers.map((picker) => [String(picker._id), picker]));
    const data = rows.map((row) => ({
      id: row._id.toString(),
      pickerId: String(row.userId),
      pickerName: pickerById[String(row.userId)]?.name || '—',
      pickerPhone: pickerById[String(row.userId)]?.phone || '—',
      type: row.type,
      amount: row.amount,
      description: row.description || '',
      status: row.status,
      createdAt: row.createdAt,
    }));
    res.json({
      success: true,
      data,
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.max(1, Math.ceil(total / limitNum)),
    });
  });
}

module.exports = new FinanceController();

