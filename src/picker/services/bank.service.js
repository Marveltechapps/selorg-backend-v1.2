/**
 * Bank service – from frontend YAML (bank.service.ts).
 * Verify validates submitted bank data and persists only real saved accounts.
 */
const mongoose = require('mongoose');
const BankAccount = require('../models/bankAccount.model');
const { withTimeout, DB_TIMEOUT_MS } = require('../utils/realtime.util');

const toUserId = (userId) => {
  if (!userId) return null;
  if (userId instanceof mongoose.Types.ObjectId) return userId;
  if (mongoose.Types.ObjectId.isValid(String(userId))) {
    return new mongoose.Types.ObjectId(String(userId));
  }
  return userId;
};

const formatBankAccount = (doc) => {
  if (!doc) return null;
  const out = { ...doc };
  out.id = out._id.toString();
  out.accountNumber = maskAccountNumber(out.accountNumber);
  out.payoutVerificationStatus =
    out.payoutVerificationStatus || (out.isVerified ? 'verified' : 'pending');
  out.payoutRejectionReason = out.payoutRejectionReason || '';
  return out;
};

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
    isDemoMode: false,
    bankName: body.bankName || undefined,
    branch: body.branch || undefined,
    message: 'Verified',
  };
};

const userIdFilter = (userId) => {
  const sid = String(userId || '').trim();
  if (!sid) return null;
  const uid = toUserId(sid);
  if (uid) return { $or: [{ userId: uid }, { userId: sid }] };
  return { userId: sid };
};

const listByUser = async (userId) => {
  const filter = userIdFilter(userId);
  if (!filter) return [];
  const list = await withTimeout(
    BankAccount.find(filter).lean().sort({ isDefault: -1, createdAt: -1 }),
    DB_TIMEOUT_MS
  );
  return (list || []).map((doc) => formatBankAccount(doc));
};

const create = async (userId, body) => {
  const uid = toUserId(userId);
  if (!uid) return null;
  const isFirst = (await withTimeout(BankAccount.countDocuments({ userId: uid }), DB_TIMEOUT_MS, 0)) === 0;
  const doc = new BankAccount({
    userId: uid,
    accountHolder: body.accountHolder,
    accountNumber: body.accountNumber,
    ifscCode: body.ifscCode,
    bankName: body.bankName,
    branch: body.branch,
    isVerified: true,
    isDefault: isFirst,
  });
  const saved = await withTimeout(doc.save(), DB_TIMEOUT_MS);
  return formatBankAccount(saved.toObject());
};

const update = async (userId, accountId, body) => {
  if (!accountId || !mongoose.Types.ObjectId.isValid(String(accountId))) return null;
  const sid = String(userId || '').trim();
  if (!sid) return null;

  const set = {};
  if (body?.accountHolder != null) set.accountHolder = String(body.accountHolder).trim();
  if (body?.accountNumber != null) set.accountNumber = String(body.accountNumber).trim();
  if (body?.ifscCode != null) set.ifscCode = String(body.ifscCode).trim().toUpperCase();
  if (body?.bankName != null) set.bankName = String(body.bankName).trim();
  if (body?.branch != null) set.branch = String(body.branch).trim();
  if (Object.keys(set).length === 0) return null;

  const uid = toUserId(sid);
  const filters = [
    uid ? { _id: accountId, userId: uid } : null,
    { _id: accountId, userId: sid },
  ].filter(Boolean);

  let updated = null;
  for (const filter of filters) {
    updated = await withTimeout(
      BankAccount.findOneAndUpdate(filter, { $set: set }, { new: true, runValidators: true }).lean(),
      DB_TIMEOUT_MS
    );
    if (updated) break;
  }

  if (!updated) {
    const existing = await withTimeout(BankAccount.findById(accountId).lean(), DB_TIMEOUT_MS);
    if (existing && String(existing.userId) === sid) {
      updated = await withTimeout(
        BankAccount.findByIdAndUpdate(accountId, { $set: set }, { new: true, runValidators: true }).lean(),
        DB_TIMEOUT_MS
      );
    }
  }

  return formatBankAccount(updated);
};

const setDefault = async (userId, accountId) => {
  await withTimeout(BankAccount.updateMany({ userId }, { isDefault: false }), DB_TIMEOUT_MS);
  const doc = await withTimeout(
    BankAccount.findOneAndUpdate({ _id: accountId, userId }, { isDefault: true }, { new: true }).lean(),
    DB_TIMEOUT_MS
  );
  return formatBankAccount(doc);
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
