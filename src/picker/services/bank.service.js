/**
 * Bank service – from frontend YAML (bank.service.ts).
 * Verify (mock), list/create/update/setDefault/delete accounts.
 * REAL-TIME: list returns [] if DB slow; verify is sync (no external gateway).
 */
const BankAccount = require('../models/bankAccount.model');
const { withTimeout, DB_TIMEOUT_MS } = require('../utils/realtime.util');

const maskAccountNumber = (num) => {
  if (!num || num.length < 4) return '****';
  return `****${num.slice(-4)}`;
};

const verify = async (body) => {
  const { accountHolder, accountNumber, ifscCode } = body;
  if (!accountHolder || !accountNumber || !ifscCode) {
    return { success: false, verified: false, error: 'Missing required fields' };
  }
  const ifscOk = /^[A-Z]{4}0[A-Z0-9]{6}$/i.test(ifscCode);
  const accOk = /^\d{9,18}$/.test(String(accountNumber).trim());
  if (!ifscOk || !accOk) {
    return { success: false, verified: false, error: 'Invalid IFSC or account number' };
  }
  return {
    success: true,
    verified: true,
    bankName: body.bankName || 'Bank',
    branch: body.branch || '',
  };
};

const listByUser = async (userId) => {
  try {
    const list = await withTimeout(
      BankAccount.find({ userId }).lean().sort({ isDefault: -1, createdAt: -1 }),
      DB_TIMEOUT_MS,
      []
    );
    return (list || []).map((doc) => ({
      ...doc,
      id: doc._id.toString(),
      accountNumber: maskAccountNumber(doc.accountNumber),
    }));
  } catch (err) {
    console.warn('[bank] listByUser fallback:', err?.message);
    return [];
  }
};

const create = async (userId, body) => {
  const isFirst = (await withTimeout(BankAccount.countDocuments({ userId }), DB_TIMEOUT_MS, 0)) === 0;
  const doc = new BankAccount({
    userId,
    accountHolder: body.accountHolder,
    accountNumber: body.accountNumber,
    ifscCode: body.ifscCode,
    bankName: body.bankName,
    branch: body.branch,
    isVerified: true,
    isDefault: isFirst,
  });
  const saved = await withTimeout(doc.save(), DB_TIMEOUT_MS);
  const out = saved.toObject();
  out.id = out._id.toString();
  out.accountNumber = maskAccountNumber(out.accountNumber);
  return out;
};

const update = async (userId, accountId, body) => {
  const doc = await withTimeout(BankAccount.findOne({ _id: accountId, userId }), DB_TIMEOUT_MS);
  if (!doc) return null;
  if (body?.accountHolder != null) doc.accountHolder = body.accountHolder;
  if (body?.accountNumber != null) doc.accountNumber = body.accountNumber;
  if (body?.ifscCode != null) doc.ifscCode = body.ifscCode;
  if (body?.bankName != null) doc.bankName = body.bankName;
  if (body?.branch != null) doc.branch = body.branch;
  await withTimeout(doc.save(), DB_TIMEOUT_MS);
  const out = doc.toObject();
  out.id = out._id.toString();
  out.accountNumber = maskAccountNumber(out.accountNumber);
  return out;
};

const setDefault = async (userId, accountId) => {
  await withTimeout(BankAccount.updateMany({ userId }, { isDefault: false }), DB_TIMEOUT_MS);
  const doc = await withTimeout(
    BankAccount.findOneAndUpdate({ _id: accountId, userId }, { isDefault: true }, { new: true }).lean(),
    DB_TIMEOUT_MS
  );
  if (!doc) return null;
  doc.id = doc._id.toString();
  doc.accountNumber = maskAccountNumber(doc.accountNumber);
  return doc;
};

const remove = async (userId, accountId) => {
  const result = await withTimeout(BankAccount.findOneAndDelete({ _id: accountId, userId }), DB_TIMEOUT_MS);
  return !!result;
};

module.exports = {
  verify,
  listByUser,
  create,
  update,
  setDefault,
  remove,
};
