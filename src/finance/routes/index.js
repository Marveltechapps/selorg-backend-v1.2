const { Router } = require('express');
const financeDashboardController = require('../controllers/financeDashboardController');
const financeController = require('../controllers/financeController');
const customerPaymentsController = require('../controllers/customerPaymentsController');
const vendorPaymentsController = require('../controllers/vendorPaymentsController');
const refundsController = require('../controllers/refundsController');
const riderCashController = require('../controllers/riderCashController');
const reconciliationController = require('../controllers/reconciliationController');
const accountingController = require('../controllers/accountingController');
const invoicingController = require('../controllers/invoicingController');
const financeAlertsController = require('../controllers/financeAlertsController');
const financeAnalyticsController = require('../controllers/financeAnalyticsController');
const approvalsController = require('../controllers/approvalsController');
const { authenticateToken, requireRole, cacheMiddleware } = require('../../core/middleware');
const { validateRequest } = require('../../middleware/zodValidator');
const appConfig = require('../../config/app');
const {
  getFinanceSummarySchema,
  getPaymentMethodSplitSchema,
  getLiveTransactionsSchema,
  getDailyMetricsSchema,
  getGatewayStatusSchema,
  getHourlyTrendsSchema,
  exportFinanceReportSchema,
  getCustomerPaymentsSchema,
  getCustomerPaymentDetailsSchema,
  retryCustomerPaymentSchema,
  getVendorInvoicesSchema,
  getVendorInvoiceDetailsSchema,
  approveInvoiceSchema,
  bulkApproveInvoicesSchema,
  rejectInvoiceSchema,
  markInvoicePaidSchema,
  uploadInvoiceSchema,
  createPaymentSchema,
  getRefundQueueSchema,
  getRefundDetailsSchema,
  approveRefundSchema,
  rejectRefundSchema,
  getReconSummarySchema,
  getRiderPayoutsSchema,
  getExceptionsSchema,
  runReconciliationSchema,
  getRunStatusSchema,
  investigateExceptionSchema,
  resolveExceptionSchema,
  getGatewayDetailsSchema,
  getLedgerEntriesSchema,
  createJournalEntrySchema,
  getJournalDetailsSchema,
  getInvoicesSchema,
  getInvoiceDetailsSchema,
  createInvoiceSchema,
  updateInvoiceStatusSchema,
  sendInvoiceSchema,
  sendReminderSchema,
  markInvoicePaidSchema2,
  getAlertsSchema,
  getAlertDetailsSchema,
  performAlertActionSchema,
  getRevenueGrowthSchema,
  getCashFlowSchema,
  getExpenseBreakdownSchema,
  exportAnalyticsReportSchema,
  getApprovalTasksSchema,
  getTaskDetailsSchema,
  submitTaskDecisionSchema,
} = require('../../validators/financeDashboardSchemas');

const router = Router();

// Import auth routes
const authRoutes = require('./authRoutes');

// Mount auth routes (login only)
router.use('/auth', authRoutes);

// All finance routes require JWT and role: finance, admin, super_admin
const financeAuth = [authenticateToken, requireRole('finance', 'admin', 'super_admin')];

// Finance Overview routes
router.get('/summary', ...financeAuth, cacheMiddleware(appConfig.cache.finance.summary), validateRequest(getFinanceSummarySchema), financeDashboardController.getFinanceSummary);
router.get('/payment-method-split', ...financeAuth, cacheMiddleware(appConfig.cache.finance.summary), validateRequest(getPaymentMethodSplitSchema), financeDashboardController.getPaymentMethodSplit);
router.get('/live-transactions', ...financeAuth, cacheMiddleware(appConfig.cache.finance.payments), validateRequest(getLiveTransactionsSchema), financeDashboardController.getLiveTransactions);
router.get('/daily-metrics', ...financeAuth, cacheMiddleware(appConfig.cache.finance.summary), validateRequest(getDailyMetricsSchema), financeDashboardController.getDailyMetrics);
router.get('/gateway-status', ...financeAuth, cacheMiddleware(appConfig.cache.finance.payments), validateRequest(getGatewayStatusSchema), financeDashboardController.getGatewayStatus);
router.get('/hourly-trends', ...financeAuth, cacheMiddleware(appConfig.cache.finance.summary), validateRequest(getHourlyTrendsSchema), financeDashboardController.getHourlyTrends);
router.post('/export', ...financeAuth, validateRequest(exportFinanceReportSchema), financeDashboardController.exportFinanceReport);

// Customer Payments routes
router.get('/customer-payments', ...financeAuth, cacheMiddleware(appConfig.cache.finance.payments), validateRequest(getCustomerPaymentsSchema), customerPaymentsController.getCustomerPayments);
router.get('/customer-payments/:id', ...financeAuth, cacheMiddleware(appConfig.cache.finance.payments), validateRequest(getCustomerPaymentDetailsSchema), customerPaymentsController.getCustomerPaymentDetails);
router.post('/customer-payments/:id/retry', ...financeAuth, validateRequest(retryCustomerPaymentSchema), customerPaymentsController.retryCustomerPayment);

// Vendor Payments routes
router.get('/vendor-payments/summary', ...financeAuth, cacheMiddleware(appConfig.cache.finance.payments), vendorPaymentsController.getPayablesSummary);
router.get('/vendor-payments/invoices', ...financeAuth, cacheMiddleware(appConfig.cache.finance.payments), validateRequest(getVendorInvoicesSchema), vendorPaymentsController.getVendorInvoices);
router.post('/vendor-payments/invoices', ...financeAuth, validateRequest(uploadInvoiceSchema), vendorPaymentsController.uploadInvoice);
router.post('/vendor-payments/invoices/bulk-approve', ...financeAuth, validateRequest(bulkApproveInvoicesSchema), vendorPaymentsController.bulkApproveInvoices);
router.get('/vendor-payments/invoices/:id', ...financeAuth, cacheMiddleware(appConfig.cache.finance.payments), validateRequest(getVendorInvoiceDetailsSchema), vendorPaymentsController.getVendorInvoiceDetails);
router.post('/vendor-payments/invoices/:id/approve', ...financeAuth, validateRequest(approveInvoiceSchema), vendorPaymentsController.approveInvoice);
router.post('/vendor-payments/invoices/:id/reject', ...financeAuth, validateRequest(rejectInvoiceSchema), vendorPaymentsController.rejectInvoice);
router.post('/vendor-payments/invoices/:id/mark-paid', ...financeAuth, validateRequest(markInvoicePaidSchema), vendorPaymentsController.markInvoicePaid);
router.post('/vendor-payments/payments', ...financeAuth, validateRequest(createPaymentSchema), vendorPaymentsController.createPayment);
router.get('/vendor-payments/vendors', ...financeAuth, cacheMiddleware(appConfig.cache.finance.payments), vendorPaymentsController.getVendors);

// Refunds routes
router.get('/refunds/summary', ...financeAuth, cacheMiddleware(appConfig.cache.finance.refunds), refundsController.getRefundsSummary);
router.get('/refunds/queue', ...financeAuth, cacheMiddleware(appConfig.cache.finance.refunds), validateRequest(getRefundQueueSchema), refundsController.getRefundQueue);
// Place specific routes before parameterized routes to avoid accidental param matching (e.g. "chargebacks" being treated as :id)
router.get('/refunds/chargebacks', ...financeAuth, cacheMiddleware(appConfig.cache.finance.refunds), refundsController.getChargebacks);
router.get('/refunds/:id', ...financeAuth, cacheMiddleware(appConfig.cache.finance.refunds), validateRequest(getRefundDetailsSchema), refundsController.getRefundDetails);
router.post('/refunds/:id/approve', ...financeAuth, validateRequest(approveRefundSchema), refundsController.approveRefund);
router.post('/refunds/:id/reject', ...financeAuth, validateRequest(rejectRefundSchema), refundsController.rejectRefund);
router.post('/refunds/:id/mark-completed', ...financeAuth, refundsController.markCompleted);

// Rider Cash Reconciliation routes
router.get('/rider-cash/summary', ...financeAuth, riderCashController.getSummary);
router.get('/rider-cash/payouts', ...financeAuth, validateRequest(getRiderPayoutsSchema), riderCashController.getPayouts);
router.get('/rider-cash/cod-reconciliation', ...financeAuth, riderCashController.getCodReconciliation);

// Reconciliation routes
router.get('/reconciliation/summary', ...financeAuth, cacheMiddleware(appConfig.cache.finance.reconciliation), validateRequest(getReconSummarySchema), reconciliationController.getReconSummary);
router.get('/reconciliation/exceptions', ...financeAuth, cacheMiddleware(appConfig.cache.finance.reconciliation), validateRequest(getExceptionsSchema), reconciliationController.getExceptions);
router.post('/reconciliation/run', ...financeAuth, validateRequest(runReconciliationSchema), reconciliationController.runReconciliation);
router.get('/reconciliation/runs/:id', ...financeAuth, cacheMiddleware(appConfig.cache.finance.reconciliation), validateRequest(getRunStatusSchema), reconciliationController.getRunStatus);
router.post('/reconciliation/exceptions/:id/investigate', ...financeAuth, validateRequest(investigateExceptionSchema), reconciliationController.investigateException);
router.post('/reconciliation/exceptions/:id/resolve', ...financeAuth, validateRequest(resolveExceptionSchema), reconciliationController.resolveException);
router.get('/reconciliation/gateways/:id', ...financeAuth, cacheMiddleware(appConfig.cache.finance.reconciliation), validateRequest(getGatewayDetailsSchema), reconciliationController.getGatewayDetails);

// Ledger routes
router.get('/ledger/summary', ...financeAuth, cacheMiddleware(appConfig.cache.finance.ledger), accountingController.getAccountingSummary);
router.get('/ledger/entries', ...financeAuth, cacheMiddleware(appConfig.cache.finance.ledger), validateRequest(getLedgerEntriesSchema), accountingController.getLedgerEntries);
router.get('/ledger/accounts', ...financeAuth, cacheMiddleware(appConfig.cache.finance.ledger), accountingController.getAccounts);
router.post('/ledger/journal-entries', ...financeAuth, validateRequest(createJournalEntrySchema), accountingController.createJournalEntry);
router.get('/ledger/journal-entries/:id', ...financeAuth, cacheMiddleware(appConfig.cache.finance.ledger), validateRequest(getJournalDetailsSchema), accountingController.getJournalDetails);

// Invoicing routes
router.get('/invoices/summary', ...financeAuth, cacheMiddleware(appConfig.cache.finance.invoices), invoicingController.getInvoiceSummary);
router.get('/invoices', ...financeAuth, cacheMiddleware(appConfig.cache.finance.invoices), validateRequest(getInvoicesSchema), invoicingController.getInvoices);
router.post('/invoices', ...financeAuth, validateRequest(createInvoiceSchema), invoicingController.createInvoice);
router.get('/invoices/:id', ...financeAuth, cacheMiddleware(appConfig.cache.finance.invoices), validateRequest(getInvoiceDetailsSchema), invoicingController.getInvoiceDetails);
router.patch('/invoices/:id/status', ...financeAuth, validateRequest(updateInvoiceStatusSchema), invoicingController.updateInvoiceStatus);
router.post('/invoices/:id/send', ...financeAuth, validateRequest(sendInvoiceSchema), invoicingController.sendInvoice);
router.post('/invoices/:id/send-reminder', ...financeAuth, validateRequest(sendReminderSchema), invoicingController.sendReminder);
router.post('/invoices/:id/mark-paid', ...financeAuth, validateRequest(markInvoicePaidSchema2), invoicingController.markInvoicePaid);

// Finance Alerts routes
router.get('/alerts', ...financeAuth, cacheMiddleware(appConfig.cache.alerts), validateRequest(getAlertsSchema), financeAlertsController.getAlerts);
router.get('/alerts/:id', ...financeAuth, cacheMiddleware(appConfig.cache.alerts), validateRequest(getAlertDetailsSchema), financeAlertsController.getAlertDetails);
router.post('/alerts/:id/action', ...financeAuth, validateRequest(performAlertActionSchema), financeAlertsController.performAlertAction);
router.post('/alerts/clear-resolved', ...financeAuth, financeAlertsController.clearResolvedAlerts);

// Finance Analytics routes
router.get('/analytics/revenue-growth', ...financeAuth, cacheMiddleware(appConfig.cache.finance.analytics), validateRequest(getRevenueGrowthSchema), financeAnalyticsController.getRevenueGrowth);
router.get('/analytics/cash-flow', ...financeAuth, cacheMiddleware(appConfig.cache.finance.analytics), validateRequest(getCashFlowSchema), financeAnalyticsController.getCashFlow);
router.get('/analytics/expense-breakdown', ...financeAuth, cacheMiddleware(appConfig.cache.finance.analytics), validateRequest(getExpenseBreakdownSchema), financeAnalyticsController.getExpenseBreakdown);
router.post('/analytics/export', ...financeAuth, validateRequest(exportAnalyticsReportSchema), financeAnalyticsController.exportAnalyticsReport);

// Approvals routes
router.get('/approvals/summary', ...financeAuth, cacheMiddleware(appConfig.cache.finance.approvals), approvalsController.getApprovalSummary);
router.get('/approvals/tasks', ...financeAuth, cacheMiddleware(appConfig.cache.finance.approvals), validateRequest(getApprovalTasksSchema), approvalsController.getApprovalTasks);
router.get('/approvals/tasks/:id', ...financeAuth, cacheMiddleware(appConfig.cache.finance.approvals), validateRequest(getTaskDetailsSchema), approvalsController.getTaskDetails);
router.post('/approvals/tasks/:id/decision', ...financeAuth, validateRequest(submitTaskDecisionSchema), approvalsController.submitTaskDecision);

// Finance Rules (Admin Dashboard - tax, payouts, reconciliation, etc.)
router.get('/tax-rules', ...financeAuth, financeController.getTaxRules);
router.post('/tax-rules', ...financeAuth, financeController.createTaxRule);
router.patch('/tax-rules/:ruleId', ...financeAuth, financeController.updateTaxRule);

router.get('/payout-schedules', ...financeAuth, financeController.getPayoutSchedules);
router.post('/payout-schedules', ...financeAuth, financeController.createPayoutSchedule);
router.patch('/payout-schedules/:scheduleId', ...financeAuth, financeController.updatePayoutSchedule);

router.get('/commission-slabs', ...financeAuth, financeController.getCommissionSlabs);
router.post('/commission-slabs', ...financeAuth, financeController.createCommissionSlab);
router.patch('/commission-slabs/:slabId', ...financeAuth, financeController.updateCommissionSlab);

router.get('/reconciliation-rules', ...financeAuth, financeController.getReconciliationRules);
router.patch('/reconciliation-rules/:ruleId', ...financeAuth, financeController.updateReconciliationRule);

router.get('/refund-policies', ...financeAuth, financeController.getRefundPolicies);
router.patch('/refund-policies/:policyId', ...financeAuth, financeController.updateRefundPolicy);

router.get('/invoice-settings', ...financeAuth, financeController.getInvoiceSettings);
router.put('/invoice-settings', ...financeAuth, financeController.updateInvoiceSettings);

router.get('/payment-terms', ...financeAuth, financeController.getPaymentTerms);
router.patch('/payment-terms/:termId', ...financeAuth, financeController.updatePaymentTerm);

router.get('/financial-limits', ...financeAuth, financeController.getFinancialLimits);
router.patch('/financial-limits/:limitId', ...financeAuth, financeController.updateFinancialLimit);

router.get('/financial-year', ...financeAuth, financeController.getFinancialYear);
router.put('/financial-year', ...financeAuth, financeController.updateFinancialYear);

module.exports = router;
