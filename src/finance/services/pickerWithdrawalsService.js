/**
 * Finance Picker Withdrawals service – list, details, approve, reject, mark_paid.
 */
const WithdrawalRequest = require('../../picker/models/withdrawalRequest.model');
const BankAccount = require('../../picker/models/bankAccount.model');
const Transaction = require('../../picker/models/transaction.model');
const withdrawalRequestService = require('../../picker/services/withdrawalRequest.service');
const { WITHDRAWAL_STATUS } = require('../../constants/pickerEnums');

function maskAccountNumber(accountNumber) {
  if (!accountNumber || accountNumber.length < 4) return '****';
  return `****${accountNumber.slice(-4)}`;
}

async function list(filters) {
  const { status, page = 1, limit = 20 } = filters;
  const query = {};
  if (status && status !== 'all' && Object.values(WITHDRAWAL_STATUS).includes(status)) {
    query.status = status;
  }

  const [items, total] = await Promise.all([
    WithdrawalRequest.find(query)
      .sort({ requestedAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('pickerId', 'name phone')
      .populate('bankAccountId', 'accountNumber bankName accountHolder')
      .lean(),
    WithdrawalRequest.countDocuments(query),
  ]);


  const data = items.map((item) => {
    const picker = (typeof item.pickerId === 'object' && item.pickerId) ? item.pickerId : null;
    const bank = item.bankAccountId;
    return {
      id: item._id.toString(),
      pickerId: item.pickerId?._id?.toString() || item.pickerId?.toString(),
      pickerName: picker?.name || '—',
      amount: item.amount,
      status: item.status,
      requestedAt: item.requestedAt,
      bankDetails: bank ? { last4: maskAccountNumber(bank.accountNumber), bankName: bank.bankName } : null,
    };
  });

  return { data, total, page: Number(page), limit: Number(limit), totalPages: Math.ceil(total / limit) || 1 };
}

async function getDetails(id) {
  const item = await WithdrawalRequest.findById(id)
    .populate('pickerId', 'name phone email')
    .populate('bankAccountId')
    .lean();
  if (!item) return null;

  const bank = item.bankAccountId;
  const bankDetails = bank ? {
    accountHolder: bank.accountHolder,
    accountNumber: maskAccountNumber(bank.accountNumber),
    ifscCode: bank.ifscCode,
    bankName: bank.bankName,
    branch: bank.branch,
  } : null;

  const pickerIdRaw = item.pickerId?._id || item.pickerId;
  const [transactions] = await Promise.all([
    Transaction.find({ userId: pickerIdRaw })
      .sort({ createdAt: -1 })
      .limit(20)
      .lean(),
  ]);

  const timeline = [];
  if (item.requestedAt) timeline.push({ stage: 'requested', timestamp: item.requestedAt });
  if (item.approvedAt) timeline.push({ stage: 'approved', timestamp: item.approvedAt });
  if (item.paidAt) timeline.push({ stage: 'paid', timestamp: item.paidAt });
  if (item.rejectedAt) timeline.push({ stage: 'rejected', timestamp: item.rejectedAt });

  return {
    id: item._id.toString(),
    pickerId: item.pickerId?._id?.toString() || item.pickerId?.toString(),
    pickerName: item.pickerId?.name || '—',
    pickerPhone: item.pickerId?.phone,
    pickerEmail: item.pickerId?.email,
    amount: item.amount,
    status: item.status,
    requestedAt: item.requestedAt,
    approvedAt: item.approvedAt,
    paidAt: item.paidAt,
    rejectedAt: item.rejectedAt,
    rejectedReason: item.rejectedReason,
    bankDetails,
    walletLedger: (transactions || []).map((t) => ({
      id: t._id.toString(),
      type: t.type,
      amount: t.amount,
      status: t.status,
      description: t.description,
      createdAt: t.createdAt,
      referenceId: t.referenceId,
    })),
    timeline,
  };
}

async function updateAction(id, action, payload, approverId) {
  if (action === 'approve') {
    const r = await withdrawalRequestService.approve(id, approverId);
    return r.success ? { success: true, request: r.request } : { success: false, error: r.error };
  }
  if (action === 'reject') {
    const r = await withdrawalRequestService.reject(id, payload?.rejectedReason, approverId);
    return r.success ? { success: true, request: r.request } : { success: false, error: r.error };
  }
  if (action === 'mark_paid') {
    const r = await withdrawalRequestService.markPaid(id);
    return r.success ? { success: true, request: r.request, transactionId: r.transactionId } : { success: false, error: r.error };
  }
  return { success: false, error: `Unknown action: ${action}` };
}

module.exports = { list, getDetails, updateAction };
