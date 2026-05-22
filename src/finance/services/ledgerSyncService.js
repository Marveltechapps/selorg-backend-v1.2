const LedgerEntry = require('../models/LedgerEntry');
const JournalEntry = require('../models/JournalEntry');
const LiveTransaction = require('../models/LiveTransaction');
const CustomerPayment = require('../models/CustomerPayment');
const VendorInvoice = require('../models/VendorInvoice');
const RefundRequest = require('../models/RefundRequest');
const Account = require('../models/Account');
const { DEFAULT_ACCOUNTS, accountName } = require('../utils/chartOfAccounts');
const { buildDayRange } = require('../utils/financeEntityScope');
const logger = require('../../utils/logger');

const ACC = {
  CASH: '1100',
  AR: '1110',
  AP: '2100',
  WALLET: '2200',
  REVENUE: '4100',
  VENDOR_EXP: '5100',
  REFUNDS: '5200',
};

const SETTLED_PAYMENT = ['captured', 'authorized'];
const PROCESSED_REFUND = ['processed', 'completed'];
const VENDOR_POST_STATUSES = ['approved', 'scheduled', 'paid'];

async function ensureChartOfAccounts() {
  for (const acc of DEFAULT_ACCOUNTS) {
    await Account.updateOne(
      { code: acc.code },
      { $setOnInsert: { ...acc, isActive: true } },
      { upsert: true }
    );
  }
}

async function journalExists(journalId) {
  const n = await LedgerEntry.countDocuments({ journalId: String(journalId) });
  return n > 0;
}

async function postJournal({ journalId, date, reference, memo, sourceModule, createdBy, lines }) {
  if (await journalExists(journalId)) {
    return { created: false, journalId };
  }

  const entryDate = date instanceof Date ? date : new Date(date);
  const actor = createdBy || 'system';

  try {
    await JournalEntry.create({
      date: entryDate,
      reference,
      memo: memo || reference,
      lines: lines.map((l) => ({
        accountCode: l.accountCode,
        accountName: l.accountName || accountName(l.accountCode),
        debit: l.debit || 0,
        credit: l.credit || 0,
        description: l.description || memo,
      })),
      status: 'posted',
      createdBy: actor,
    });
  } catch (err) {
    if (err.code !== 11000) throw err;
    return { created: false, journalId };
  }

  await LedgerEntry.insertMany(
    lines.map((l) => ({
      date: entryDate,
      reference,
      description: l.description || memo || reference,
      accountCode: l.accountCode,
      accountName: l.accountName || accountName(l.accountCode),
      debit: l.debit || 0,
      credit: l.credit || 0,
      journalId: String(journalId),
      sourceModule,
      createdBy: actor,
    }))
  );

  return { created: true, journalId };
}

async function syncPaymentJournals(limit = 300) {
  let created = 0;
  const liveTxns = await LiveTransaction.find({ status: 'success' })
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();

  for (const txn of liveTxns) {
    const amount = Number(txn.amount) || 0;
    if (amount <= 0) continue;
    const journalId = `auto-pay-${txn.txnId || txn._id}`;
    const result = await postJournal({
      journalId,
      date: txn.createdAt || new Date(),
      reference: txn.txnId || String(txn._id),
      memo: `Customer payment — ${txn.orderId || txn.customerName || 'order'}`,
      sourceModule: 'payments',
      createdBy: 'finance-sync',
      lines: [
        {
          accountCode: ACC.CASH,
          debit: amount,
          credit: 0,
          description: `Receipt via ${txn.gateway}`,
        },
        {
          accountCode: ACC.REVENUE,
          debit: 0,
          credit: amount,
          description: txn.methodDisplay || 'Sale',
        },
      ],
    });
    if (result.created) created += 1;
  }

  const payments = await CustomerPayment.find({
    status: { $in: SETTLED_PAYMENT },
  })
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();

  for (const pay of payments) {
    const amount = Number(pay.amount) || 0;
    if (amount <= 0 || !pay.orderId) continue;
    const journalId = `auto-order-${pay.orderId}`;
    if (await journalExists(journalId)) continue;

    const result = await postJournal({
      journalId,
      date: pay.createdAt || pay.lastUpdatedAt || new Date(),
      reference: pay.gatewayRef || pay.orderId,
      memo: `Order payment — ${pay.orderId}`,
      sourceModule: 'payments',
      createdBy: 'finance-sync',
      lines: [
        {
          accountCode: pay.methodType === 'wallet' ? ACC.WALLET : ACC.CASH,
          debit: amount,
          credit: 0,
          description: pay.paymentMethodDisplay,
        },
        {
          accountCode: ACC.REVENUE,
          debit: 0,
          credit: amount,
          description: `Revenue — ${pay.orderId}`,
        },
      ],
    });
    if (result.created) created += 1;
  }

  return created;
}

async function syncVendorJournals(limit = 200) {
  let created = 0;
  const invoices = await VendorInvoice.find({
    status: { $in: VENDOR_POST_STATUSES },
  })
    .sort({ invoiceDate: -1 })
    .limit(limit)
    .lean();

  for (const inv of invoices) {
    const amount = Number(inv.amount) || 0;
    if (amount <= 0) continue;
    const journalId = `auto-vendor-${inv._id}`;
    const result = await postJournal({
      journalId,
      date: inv.invoiceDate || inv.uploadedAt || new Date(),
      reference: inv.invoiceNumber,
      memo: `Vendor bill — ${inv.vendorName}`,
      sourceModule: 'vendor',
      createdBy: inv.uploadedBy || 'finance-sync',
      lines: [
        {
          accountCode: ACC.VENDOR_EXP,
          debit: amount,
          credit: 0,
          description: inv.vendorName,
        },
        {
          accountCode: ACC.AP,
          debit: 0,
          credit: amount,
          description: `Payable — ${inv.invoiceNumber}`,
        },
      ],
    });
    if (result.created) created += 1;

    if (inv.status === 'paid') {
      const payJournalId = `auto-vendor-pay-${inv._id}`;
      const payResult = await postJournal({
        journalId: payJournalId,
        date: inv.updatedAt || inv.invoiceDate || new Date(),
        reference: `${inv.invoiceNumber}-PAY`,
        memo: `Vendor payment — ${inv.vendorName}`,
        sourceModule: 'vendor',
        createdBy: inv.uploadedBy || 'finance-sync',
        lines: [
          {
            accountCode: ACC.AP,
            debit: amount,
            credit: 0,
            description: `Clear payable — ${inv.invoiceNumber}`,
          },
          {
            accountCode: ACC.CASH,
            debit: 0,
            credit: amount,
            description: 'Vendor disbursement',
          },
        ],
      });
      if (payResult.created) created += 1;
    }
  }

  return created;
}

async function syncRefundJournals(limit = 200) {
  let created = 0;
  const refunds = await RefundRequest.find({
    status: { $in: PROCESSED_REFUND },
  })
    .sort({ processedAt: -1, updatedAt: -1 })
    .limit(limit)
    .lean();

  for (const refund of refunds) {
    const amount = Number(refund.amount) || 0;
    if (amount <= 0) continue;
    const journalId = `auto-refund-${refund._id}`;
    const creditAccount =
      refund.refundMethod === 'wallet' ? ACC.WALLET : ACC.CASH;

    const result = await postJournal({
      journalId,
      date: refund.processedAt || refund.completedAt || refund.updatedAt || new Date(),
      reference: refund.orderNumber || String(refund.orderId),
      memo: `Customer refund — ${refund.reasonCode}`,
      sourceModule: 'refunds',
      createdBy: 'finance-sync',
      lines: [
        {
          accountCode: ACC.REFUNDS,
          debit: amount,
          credit: 0,
          description: refund.reasonText,
        },
        {
          accountCode: creditAccount,
          debit: 0,
          credit: amount,
          description: `Refund — ${refund.orderNumber || refund.orderId}`,
        },
      ],
    });
    if (result.created) created += 1;
  }

  return created;
}

async function syncOperationalLedger(options = {}) {
  const limit = options.limit || 300;
  await ensureChartOfAccounts();

  const [payments, vendors, refunds] = await Promise.all([
    syncPaymentJournals(limit),
    syncVendorJournals(Math.min(limit, 200)),
    syncRefundJournals(Math.min(limit, 200)),
  ]);

  const total = payments + vendors + refunds;
  if (total > 0) {
    logger.info('Ledger sync completed', { payments, vendors, refunds, total });
  }

  return { payments, vendors, refunds, total };
}

module.exports = {
  ensureChartOfAccounts,
  syncOperationalLedger,
  postJournal,
  ACC,
};
