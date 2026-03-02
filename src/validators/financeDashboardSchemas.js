const { z } = require('zod');

// Finance Overview Schemas
const getFinanceSummarySchema = z.object({
  query: z.object({
    entityId: z.string().min(1, 'Entity ID is required'),
    date: z.string().datetime('Invalid date format'),
  }),
});

const getPaymentMethodSplitSchema = z.object({
  query: z.object({
    entityId: z.string().min(1, 'Entity ID is required'),
    date: z.string().datetime('Invalid date format'),
  }),
});

const getLiveTransactionsSchema = z.object({
  query: z.object({
    entityId: z.string().min(1, 'Entity ID is required'),
    limit: z.string().optional().transform(val => val ? parseInt(val) : 10),
    cursor: z.string().optional(),
    method: z.string().optional(),
  }),
});

const getDailyMetricsSchema = z.object({
  query: z.object({
    entityId: z.string().min(1, 'Entity ID is required'),
    days: z.string().optional().transform(val => val ? parseInt(val) : 5),
  }),
});

const getGatewayStatusSchema = z.object({
  query: z.object({
    entityId: z.string().min(1, 'Entity ID is required'),
  }),
});

const getHourlyTrendsSchema = z.object({
  query: z.object({
    entityId: z.string().min(1, 'Entity ID is required'),
    date: z.string().date().optional(),
  }),
});

const exportFinanceReportSchema = z.object({
  body: z.object({
    entityId: z.string().min(1, 'Entity ID is required'),
    dateRange: z.object({
      from: z.string().datetime(),
      to: z.string().datetime(),
    }),
    format: z.enum(['pdf', 'csv', 'xlsx']),
    scope: z.array(z.string()),
  }),
});

// Customer Payments Schemas
const getCustomerPaymentsSchema = z.object({
  query: z.object({
    query: z.string().optional(),
    status: z.enum(['captured', 'authorized', 'pending', 'declined', 'refunded', 'chargeback', 'all']).optional(),
    dateFrom: z.string().datetime().optional(),
    dateTo: z.string().datetime().optional(),
    methodType: z.enum(['card', 'wallet', 'net_banking', 'cod', 'all']).optional(),
    page: z.string().optional().transform(val => val ? parseInt(val) : 1),
    pageSize: z.string().optional().transform(val => val ? parseInt(val) : 20),
  }),
});

const getCustomerPaymentDetailsSchema = z.object({
  params: z.object({
    id: z.string().min(1, 'Payment ID is required'),
  }),
});

const retryCustomerPaymentSchema = z.object({
  params: z.object({
    id: z.string().min(1, 'Payment ID is required'),
  }),
  body: z.object({
    amount: z.number().min(0).optional(),
  }),
});

// Vendor Payments Schemas
const getVendorInvoicesSchema = z.object({
  query: z.object({
    status: z.enum(['pending_approval', 'approved', 'scheduled', 'paid', 'overdue', 'rejected', 'all']).optional(),
    vendorId: z.string().optional(),
    dateFrom: z.string().date().optional(),
    dateTo: z.string().date().optional(),
    page: z.string().optional().transform(val => val ? parseInt(val) : 1),
    pageSize: z.string().optional().transform(val => val ? parseInt(val) : 20),
  }),
});

const getVendorInvoiceDetailsSchema = z.object({
  params: z.object({
    id: z.string().min(1, 'Invoice ID is required'),
  }),
});

const approveInvoiceSchema = z.object({
  params: z.object({
    id: z.string().min(1, 'Invoice ID is required'),
  }),
});

const bulkApproveInvoicesSchema = z.object({
  body: z.object({
    ids: z.array(z.string().min(1, 'Invoice ID is required')).min(1, 'At least one invoice ID is required').max(100),
  }),
});

const rejectInvoiceSchema = z.object({
  params: z.object({
    id: z.string().min(1, 'Invoice ID is required'),
  }),
  body: z.object({
    reason: z.string().min(1, 'Reason is required'),
  }),
});

const markInvoicePaidSchema = z.object({
  params: z.object({
    id: z.string().min(1, 'Invoice ID is required'),
  }),
});

const uploadInvoiceSchema = z.object({
  body: z.object({
    vendorId: z.string().min(1, 'Vendor ID is required'),
    invoiceNumber: z.string().min(1, 'Invoice number is required'),
    invoiceDate: z.string().date(),
    dueDate: z.string().date(),
    amount: z.number().min(0, 'Amount must be positive'),
    currency: z.string().optional(),
  }),
});

const createPaymentSchema = z.object({
  body: z.object({
    vendorId: z.string().min(1, 'Vendor ID is required'),
    invoices: z.array(z.object({
      invoiceId: z.string().min(1, 'Invoice ID is required'),
      amount: z.number().min(0, 'Amount must be positive'),
    })),
    paymentDate: z.string().date(),
    method: z.string().min(1, 'Payment method is required'),
    reference: z.string().min(1, 'Reference is required'),
  }),
});

// Refunds Schemas
const getRefundQueueSchema = z.object({
  query: z.object({
    status: z.enum(['pending', 'approved', 'rejected', 'processed', 'escalated', 'all']).optional(),
    reason: z.enum(['item_damaged', 'expired', 'late_delivery', 'wrong_item', 'customer_cancelled', 'other', 'all']).optional(),
    dateFrom: z.string().datetime().optional(),
    dateTo: z.string().datetime().optional(),
    page: z.string().optional().transform(val => val ? parseInt(val) : 1),
    pageSize: z.string().optional().transform(val => val ? parseInt(val) : 20),
  }),
});

const getRefundDetailsSchema = z.object({
  params: z.object({
    id: z.string().min(1, 'Refund ID is required'),
  }),
});

const approveRefundSchema = z.object({
  params: z.object({
    id: z.string().min(1, 'Refund ID is required'),
  }),
  body: z.object({
    notes: z.string().optional(),
    partialAmount: z.number().min(0).optional(),
  }),
});

const rejectRefundSchema = z.object({
  params: z.object({
    id: z.string().min(1, 'Refund ID is required'),
  }),
  body: z.object({
    reason: z.string().min(1, 'Reason is required'),
  }),
});

// Reconciliation Schemas
const getReconSummarySchema = z.object({
  query: z.object({
    date: z.string().date().optional(),
  }),
});

const getRiderPayoutsSchema = z.object({
  query: z.object({
    page: z.string().optional().transform(val => val ? parseInt(val) : 1),
    pageSize: z.string().optional().transform(val => val ? parseInt(val) : 20),
    status: z.enum(['pending', 'approved', 'processing', 'completed', 'rejected', 'all']).optional(),
  }),
});

const getExceptionsSchema = z.object({
  query: z.object({
    status: z.enum(['open', 'in_review', 'resolved', 'ignored', 'all']).optional(),
  }),
});

const runReconciliationSchema = z.object({
  body: z.object({
    date: z.string().date(),
    gateways: z.array(z.string()).min(1, 'At least one gateway is required'),
  }),
});

const getRunStatusSchema = z.object({
  params: z.object({
    id: z.string().min(1, 'Run ID is required'),
  }),
});

const investigateExceptionSchema = z.object({
  params: z.object({
    id: z.string().min(1, 'Exception ID is required'),
  }),
});

const resolveExceptionSchema = z.object({
  params: z.object({
    id: z.string().min(1, 'Exception ID is required'),
  }),
  body: z.object({
    resolutionType: z.enum(['investigate', 'resolve', 'write_off', 'retry_match']),
    note: z.string().optional(),
  }),
});

const getGatewayDetailsSchema = z.object({
  params: z.object({
    id: z.string().min(1, 'Gateway ID is required'),
  }),
});

// Ledger Schemas
const getLedgerEntriesSchema = z.object({
  query: z.object({
    dateFrom: z.string().date().optional(),
    dateTo: z.string().date().optional(),
    accountCode: z.string().optional(),
  }),
});

const createJournalEntrySchema = z.object({
  body: z.object({
    date: z.string().date(),
    reference: z.string().min(1, 'Reference is required'),
    memo: z.string().optional(),
    lines: z.array(z.object({
      accountCode: z.string().min(1, 'Account code is required'),
      accountName: z.string().optional(),
      debit: z.number().min(0, 'Debit must be non-negative'),
      credit: z.number().min(0, 'Credit must be non-negative'),
      description: z.string().optional(),
    })).min(2, 'At least 2 lines are required'),
    createdBy: z.string().min(1, 'Created by is required'),
  }),
});

const getJournalDetailsSchema = z.object({
  params: z.object({
    id: z.string().min(1, 'Journal ID is required'),
  }),
});

// Invoicing Schemas
const getInvoicesSchema = z.object({
  query: z.object({
    status: z.enum(['sent', 'pending', 'overdue', 'paid', 'draft', 'cancelled', 'all']).optional(),
    search: z.string().optional(),
  }),
});

const getInvoiceDetailsSchema = z.object({
  params: z.object({
    id: z.string().min(1, 'Invoice ID is required'),
  }),
});

const createInvoiceSchema = z.object({
  body: z.object({
    customerId: z.string().optional(),
    customerName: z.string().min(1, 'Customer name is required'),
    customerEmail: z.string().email('Invalid email format'),
    issueDate: z.string().datetime(),
    dueDate: z.string().datetime(),
    items: z.array(z.object({
      description: z.string().min(1, 'Description is required'),
      quantity: z.number().min(1, 'Quantity must be at least 1'),
      unitPrice: z.number().min(0, 'Unit price must be non-negative'),
      taxPercent: z.number().min(0).max(100, 'Tax percent must be between 0 and 100'),
    })).min(1, 'At least one item is required'),
    notes: z.string().optional(),
  }),
});

const updateInvoiceStatusSchema = z.object({
  params: z.object({
    id: z.string().min(1, 'Invoice ID is required'),
  }),
  body: z.object({
    status: z.enum(['sent', 'pending', 'overdue', 'paid', 'draft', 'cancelled']),
  }),
});

const sendInvoiceSchema = z.object({
  params: z.object({
    id: z.string().min(1, 'Invoice ID is required'),
  }),
});

const sendReminderSchema = z.object({
  params: z.object({
    id: z.string().min(1, 'Invoice ID is required'),
  }),
});

const markInvoicePaidSchema2 = z.object({
  params: z.object({
    id: z.string().min(1, 'Invoice ID is required'),
  }),
});

// Finance Alerts Schemas
const getAlertsSchema = z.object({
  query: z.object({
    status: z.enum(['open', 'acknowledged', 'in_progress', 'resolved', 'dismissed', 'all']).optional(),
  }),
});

const getAlertDetailsSchema = z.object({
  params: z.object({
    id: z.string().min(1, 'Alert ID is required'),
  }),
});

const performAlertActionSchema = z.object({
  params: z.object({
    id: z.string().min(1, 'Alert ID is required'),
  }),
  body: z.object({
    actionType: z.enum(['check_gateway', 'review_txn', 'reconcile', 'acknowledge', 'dismiss', 'resolve', 'add_note']),
    metadata: z.any().optional(),
  }),
});

// Finance Analytics Schemas
const getRevenueGrowthSchema = z.object({
  query: z.object({
    from: z.string().date().optional(),
    to: z.string().date().optional(),
    granularity: z.enum(['month', 'quarter']).optional(),
  }),
});

const getCashFlowSchema = z.object({
  query: z.object({
    from: z.string().date().optional(),
    to: z.string().date().optional(),
    granularity: z.enum(['month', 'quarter']).optional(),
  }),
});

const getExpenseBreakdownSchema = z.object({
  query: z.object({
    from: z.string().date().optional(),
    to: z.string().date().optional(),
    granularity: z.enum(['month', 'quarter']).optional(),
  }),
});

const exportAnalyticsReportSchema = z.object({
  body: z.object({
    metric: z.enum(['revenue_growth', 'cash_flow', 'expense_breakdown', 'pnl']),
    from: z.string().date(),
    to: z.string().date(),
    format: z.enum(['pdf', 'xlsx']),
    details: z.enum(['summary', 'detailed']).optional(),
  }),
});

// Approvals Schemas
const getApprovalTasksSchema = z.object({
  query: z.object({
    status: z.enum(['pending', 'approved', 'rejected']).optional(),
    type: z.enum(['refund', 'invoice', 'vendor_payment', 'large_payment', 'adjustment', 'all']).optional(),
    minAmount: z.string().optional().transform(val => val ? parseFloat(val) : undefined),
  }),
});

const getTaskDetailsSchema = z.object({
  params: z.object({
    id: z.string().min(1, 'Task ID is required'),
  }),
});

const submitTaskDecisionSchema = z.object({
  params: z.object({
    id: z.string().min(1, 'Task ID is required'),
  }),
  body: z.object({
    decision: z.enum(['approve', 'reject']),
    note: z.string().optional(),
  }),
});

module.exports = {
  // Finance Overview
  getFinanceSummarySchema,
  getPaymentMethodSplitSchema,
  getLiveTransactionsSchema,
  getDailyMetricsSchema,
  getGatewayStatusSchema,
  getHourlyTrendsSchema,
  exportFinanceReportSchema,
  // Customer Payments
  getCustomerPaymentsSchema,
  getCustomerPaymentDetailsSchema,
  retryCustomerPaymentSchema,
  // Vendor Payments
  getVendorInvoicesSchema,
  getVendorInvoiceDetailsSchema,
  approveInvoiceSchema,
  bulkApproveInvoicesSchema,
  rejectInvoiceSchema,
  markInvoicePaidSchema,
  uploadInvoiceSchema,
  createPaymentSchema,
  // Refunds
  getRefundQueueSchema,
  getRefundDetailsSchema,
  approveRefundSchema,
  rejectRefundSchema,
  // Reconciliation
  getReconSummarySchema,
  getRiderPayoutsSchema,
  getExceptionsSchema,
  runReconciliationSchema,
  getRunStatusSchema,
  investigateExceptionSchema,
  resolveExceptionSchema,
  getGatewayDetailsSchema,
  // Ledger
  getLedgerEntriesSchema,
  createJournalEntrySchema,
  getJournalDetailsSchema,
  // Invoicing
  getInvoicesSchema,
  getInvoiceDetailsSchema,
  createInvoiceSchema,
  updateInvoiceStatusSchema,
  sendInvoiceSchema,
  sendReminderSchema,
  markInvoicePaidSchema2,
  // Finance Alerts
  getAlertsSchema,
  getAlertDetailsSchema,
  performAlertActionSchema,
  // Finance Analytics
  getRevenueGrowthSchema,
  getCashFlowSchema,
  getExpenseBreakdownSchema,
  exportAnalyticsReportSchema,
  // Approvals
  getApprovalTasksSchema,
  getTaskDetailsSchema,
  submitTaskDecisionSchema,
};

