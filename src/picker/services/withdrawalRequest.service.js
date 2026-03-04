/**
 * WithdrawalRequest service – handles create (via wallet), approve, reject, mark_paid.
 * Lock amount on request; deduct only on Mark Paid.
 */
const WithdrawalRequest = require('../models/withdrawalRequest.model');
const Wallet = require('../models/wallet.model');
const Transaction = require('../models/transaction.model');
const BankAccount = require('../models/bankAccount.model');
const { WITHDRAWAL_STATUS } = require('../../constants/pickerEnums');
const logger = require('../../core/utils/logger');

async function getOrCreateWallet(userId) {
  let w = await Wallet.findOne({ userId });
  if (!w) {
    w = await Wallet.create({ userId });
  }
  return w;
}

/**
 * Create withdrawal request (called from wallet.service.withdraw).
 * Locks amount: availableBalance -= amount, reservedBalance += amount.
 */
async function createRequest(userId, { amount, bankAccountId, idempotencyKey }) {
  if (!amount || amount <= 0) {
    return { success: false, error: 'Invalid amount' };
  }

  if (idempotencyKey) {
    const existing = await WithdrawalRequest.findOne({ idempotencyKey, pickerId: userId });
    if (existing) {
      return {
        success: true,
        withdrawalRequestId: existing._id.toString(),
        transactionId: '',
        amount: existing.amount,
        status: existing.status === WITHDRAWAL_STATUS.PENDING ? 'pending' : existing.status === WITHDRAWAL_STATUS.APPROVED ? 'processing' : existing.status === WITHDRAWAL_STATUS.PAID ? 'completed' : 'failed',
        error: existing.status === WITHDRAWAL_STATUS.REJECTED ? 'Request was rejected' : undefined,
      };
    }
  }

  const wallet = await getOrCreateWallet(userId);
  if ((wallet.availableBalance ?? 0) < amount) {
    return { success: false, transactionId: '', amount, status: 'failed', error: 'Insufficient balance' };
  }

  const bank = await BankAccount.findOne({ _id: bankAccountId, userId });
  if (!bank) {
    return { success: false, transactionId: '', amount, status: 'failed', error: 'Bank account not found' };
  }

  const req = await WithdrawalRequest.create({
    pickerId: userId,
    amount,
    status: WITHDRAWAL_STATUS.PENDING,
    bankAccountId,
    idempotencyKey: idempotencyKey || undefined,
  });

  wallet.availableBalance = (wallet.availableBalance ?? 0) - amount;
  wallet.reservedBalance = (wallet.reservedBalance ?? 0) + amount;
  await wallet.save();

  try {
    const websocketService = require('../../utils/websocket');
    if (websocketService && typeof websocketService.broadcastToRole === 'function') {
      websocketService.broadcastToRole('finance', 'WITHDRAWAL_REQUESTED', {
        withdrawalRequestId: req._id.toString(),
        pickerId: userId.toString(),
        amount,
        requestedAt: req.requestedAt,
      });
    }
  } catch (err) {
    logger.warn('[withdrawalRequest] Failed to emit WITHDRAWAL_REQUESTED (non-blocking)', { error: err?.message });
  }
  try {
    const { logPickerAction } = require('./pickerActionLog.service');
    await logPickerAction({
      actionType: 'withdrawal_request',
      pickerId: String(userId),
      metadata: { amount, withdrawalRequestId: req._id?.toString?.() },
    });
  } catch (_) {}

  return {
    success: true,
    withdrawalRequestId: req._id.toString(),
    transactionId: '',
    amount,
    status: 'pending',
  };
}

/**
 * Approve withdrawal request. Amount stays locked.
 */
async function approve(requestId, approvedBy) {
  const req = await WithdrawalRequest.findById(requestId);
  if (!req) return { success: false, error: 'Withdrawal request not found' };
  if (req.status !== WITHDRAWAL_STATUS.PENDING) {
    return { success: false, error: `Cannot approve; current status: ${req.status}` };
  }

  req.status = WITHDRAWAL_STATUS.APPROVED;
  req.approvedAt = new Date();
  req.approvedBy = approvedBy;
  await req.save();

  return { success: true, request: req };
}

/**
 * Reject withdrawal request. Unlock wallet (availableBalance += amount, reservedBalance -= amount).
 */
async function reject(requestId, rejectedReason, rejectedBy) {
  const req = await WithdrawalRequest.findById(requestId);
  if (!req) return { success: false, error: 'Withdrawal request not found' };
  if (req.status !== WITHDRAWAL_STATUS.PENDING && req.status !== WITHDRAWAL_STATUS.APPROVED) {
    return { success: false, error: `Cannot reject; current status: ${req.status}` };
  }

  const wallet = await getOrCreateWallet(req.pickerId);
  wallet.availableBalance = (wallet.availableBalance ?? 0) + req.amount;
  wallet.reservedBalance = Math.max(0, (wallet.reservedBalance ?? 0) - req.amount);
  await wallet.save();

  req.status = WITHDRAWAL_STATUS.REJECTED;
  req.rejectedAt = new Date();
  req.rejectedReason = rejectedReason || 'Rejected by finance';
  await req.save();

  return { success: true, request: req };
}

/**
 * Mark Paid. Deduct from wallet (reservedBalance -= amount), create Transaction, unlock.
 */
async function markPaid(requestId) {
  const req = await WithdrawalRequest.findById(requestId);
  if (!req) return { success: false, error: 'Withdrawal request not found' };
  if (req.status !== WITHDRAWAL_STATUS.APPROVED) {
    return { success: false, error: `Cannot mark paid; current status: ${req.status}` };
  }

  const wallet = await getOrCreateWallet(req.pickerId);
  const reserved = wallet.reservedBalance ?? 0;
  if (reserved < req.amount) {
    logger.warn('[withdrawalRequest] reservedBalance mismatch', { requestId, amount: req.amount, reserved });
  }
  wallet.reservedBalance = Math.max(0, reserved - req.amount);
  await wallet.save();

  const tx = await Transaction.create({
    userId: req.pickerId,
    type: 'debit',
    amount: req.amount,
    status: 'completed',
    description: 'Withdrawal',
    bankAccountId: req.bankAccountId,
    referenceId: `WR-${req._id}`,
    metadata: { withdrawalRequestId: req._id.toString(), bankAccountId: req.bankAccountId.toString() },
    completedAt: new Date(),
  });

  req.status = WITHDRAWAL_STATUS.PAID;
  req.paidAt = new Date();
  await req.save();

  return { success: true, request: req, transactionId: tx._id.toString() };
}

/**
 * Get withdrawal request by id (for picker app - own requests only).
 */
async function getByIdForPicker(requestId, pickerId) {
  const req = await WithdrawalRequest.findOne({ _id: requestId, pickerId }).lean();
  return req;
}

module.exports = {
  createRequest,
  approve,
  reject,
  markPaid,
  getByIdForPicker,
};
