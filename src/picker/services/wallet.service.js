/**
 * Wallet service – from frontend YAML (wallet.service.ts).
 * Balance, withdraw, history, get transaction by id.
 * REAL-TIME: balance/history return defaults if DB slow; withdraw fails fast with error.
 */
const Wallet = require('../models/wallet.model');
const Transaction = require('../models/transaction.model');
const BankAccount = require('../models/bankAccount.model');
const Attendance = require('../models/attendance.model');
const { withTimeout, DB_TIMEOUT_MS } = require('../utils/realtime.util');

const BASE_PAY_PER_HOUR = 100;
const OT_RATE_PER_HOUR = 100 * 1.25;

const defaultBalance = { availableBalance: 0, pendingBalance: 0, totalEarnings: 0, currency: 'INR' };

const getOrCreateWallet = async (userId) => {
  let w = await Wallet.findOne({ userId });
  if (!w) {
    w = await Wallet.create({ userId });
  }
  return w;
};

const getBalance = async (userId) => {
  try {
    const w = await withTimeout(getOrCreateWallet(userId), DB_TIMEOUT_MS);
    return {
      availableBalance: w?.availableBalance ?? 0,
      pendingBalance: w?.pendingBalance ?? 0,
      totalEarnings: w?.totalEarnings ?? 0,
      currency: w?.currency || 'INR',
    };
  } catch (err) {
    console.warn('[wallet] getBalance fallback:', err?.message);
    return defaultBalance;
  }
};

const withdraw = async (userId, body) => {
  const { amount, bankAccountId, idempotencyKey } = body;
  if (!amount || amount <= 0) return { success: false, error: 'Invalid amount' };
  const wallet = await getOrCreateWallet(userId);
  if (wallet.availableBalance < amount) {
    return { success: false, transactionId: '', amount, status: 'failed', error: 'Insufficient balance' };
  }
  const bank = await BankAccount.findOne({ _id: bankAccountId, userId });
  if (!bank) {
    return { success: false, transactionId: '', amount, status: 'failed', error: 'Bank account not found' };
  }
  const tx = new Transaction({
    userId,
    type: 'debit',
    amount,
    status: 'processing',
    description: 'Withdrawal',
    bankAccountId,
    referenceId: idempotencyKey,
    metadata: { bankAccountId: bankAccountId.toString() },
  });
  await tx.save();
  wallet.availableBalance -= amount;
  wallet.pendingBalance = (wallet.pendingBalance || 0) + amount;
  await wallet.save();
  tx.status = 'completed';
  tx.completedAt = new Date();
  await tx.save();
  wallet.pendingBalance -= amount;
  await wallet.save();
  return {
    success: true,
    transactionId: tx._id.toString(),
    amount,
    status: 'completed',
    estimatedCompletionTime: new Date().toISOString(),
  };
};

const getHistory = async (userId, query) => {
  try {
    const page = Math.max(1, parseInt(query?.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(query?.limit, 10) || 20));
    const filter = { userId };
    if (query?.type) filter.type = query.type;
    if (query?.status) filter.status = query.status;
    if (query?.startDate || query?.endDate) {
      filter.createdAt = {};
      if (query.startDate) filter.createdAt.$gte = new Date(query.startDate);
      if (query.endDate) filter.createdAt.$lte = new Date(query.endDate);
    }
    const [transactions, total] = await withTimeout(
      Promise.all([
        Transaction.find(filter).lean().sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
        Transaction.countDocuments(filter),
      ]),
      DB_TIMEOUT_MS,
      [[], 0]
    );
    const totalPages = Math.ceil((total ?? 0) / limit) || 1;
    const items = (transactions || []).map((t) => ({
      id: t._id.toString(),
      type: t.type,
      amount: t.amount,
      status: t.status,
      description: t.description,
      referenceId: t.referenceId,
      createdAt: t.createdAt,
      completedAt: t.completedAt,
      metadata: t.metadata,
    }));
    return { transactions: items, pagination: { page, limit, total: total ?? 0, totalPages } };
  } catch (err) {
    console.warn('[wallet] getHistory fallback:', err?.message);
    return { transactions: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 1 } };
  }
};

const getTransactionById = async (userId, transactionId) => {
  try {
    const t = await withTimeout(
      Transaction.findOne({ _id: transactionId, userId }).lean(),
      DB_TIMEOUT_MS,
      null
    );
    if (!t) return null;
    return {
      id: t._id.toString(),
      type: t.type,
      amount: t.amount,
      status: t.status,
      description: t.description,
      referenceId: t.referenceId,
      createdAt: t.createdAt,
      completedAt: t.completedAt,
      metadata: t.metadata,
    };
  } catch (err) {
    console.warn('[wallet] getTransactionById fallback:', err?.message);
    return null;
  }
};

/** Current month earnings breakdown for payouts screen (from attendance + wallet). */
const getEarningsBreakdown = async (userId) => {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

  const [attendanceList, wallet] = await Promise.all([
    Attendance.find({ userId, punchIn: { $gte: start, $lte: end } }).lean(),
    getOrCreateWallet(userId),
  ]);

  let baseHours = 0;
  let overtimeHours = 0;
  for (const a of attendanceList) {
    baseHours += a.regularHours ?? 0;
    overtimeHours += a.overtimeHours ?? 0;
  }

  const basePay = Math.round(baseHours * BASE_PAY_PER_HOUR);
  const overtime = Math.round(overtimeHours * OT_RATE_PER_HOUR);

  const performance = 3000;
  const attendance = 1500;
  const accuracy = 1000;
  const referral = 500;

  const grossPay = basePay + overtime + performance + attendance + accuracy + referral;
  const tds = Math.round(grossPay * 0.05);
  const deductions = { tds };
  const netPayout = Math.max(0, (wallet && wallet.availableBalance != null) ? wallet.availableBalance : grossPay - tds);

  return {
    basePay,
    baseHours,
    overtime,
    overtimeHours,
    performance,
    attendance,
    accuracy,
    referral,
    grossPay,
    deductions,
    netPayout,
    incentives: { referral: 2500, bonus: 1000, total: 3500 },
  };
};

module.exports = {
  getBalance,
  withdraw,
  getHistory,
  getTransactionById,
  getEarningsBreakdown,
};
