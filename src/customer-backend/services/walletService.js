const { CustomerWallet } = require('../models/CustomerWallet');
const { WalletTransaction } = require('../models/WalletTransaction');

const MAX_TOP_UP_AMOUNT = Number(process.env.WALLET_MAX_TOP_UP_AMOUNT) || 10000;

async function getOrCreateWallet(customerId) {
  let wallet = await CustomerWallet.findOne({ customerId });
  if (!wallet) {
    wallet = await CustomerWallet.create({ customerId, balance: 0 });
  }
  return wallet;
}

/**
 * Credit a customer wallet and record a transaction (shared by top-up and admin flows).
 */
async function creditWallet(customerId, amount, meta = {}) {
  const parsed = Number(amount);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return { error: 'Invalid amount' };
  }
  if (parsed > MAX_TOP_UP_AMOUNT) {
    return { error: `Amount cannot exceed ₹${MAX_TOP_UP_AMOUNT}` };
  }

  const {
    source = 'manual_credit',
    description = 'Wallet top-up',
    referenceId,
    referenceType = 'manual',
  } = meta;

  // Idempotent payment top-ups keyed by gateway txn id.
  if (source === 'payment_topup' && referenceId) {
    const existing = await WalletTransaction.findOne({
      customerId,
      source: 'payment_topup',
      referenceId: String(referenceId),
    }).lean();
    if (existing) {
      const wallet = await getOrCreateWallet(customerId);
      return { balance: wallet.balance, credited: 0, alreadyCredited: true };
    }
  }

  const wallet = await getOrCreateWallet(customerId);
  if (!wallet.isActive) {
    return { error: 'Wallet not available' };
  }

  const balanceBefore = wallet.balance;
  wallet.balance += parsed;
  wallet.lastTransactionAt = new Date();
  await wallet.save();

  try {
    await WalletTransaction.create({
      walletId: wallet._id,
      customerId,
      type: 'credit',
      amount: parsed,
      balanceBefore,
      balanceAfter: wallet.balance,
      source,
      referenceId,
      referenceType,
      description,
    });
  } catch (err) {
    if (err && (err.code === 11000 || String(err.message || '').includes('duplicate'))) {
      // Lost a race — reverse the balance bump we just applied.
      wallet.balance = Math.max(0, wallet.balance - parsed);
      await wallet.save();
      const fresh = await getOrCreateWallet(customerId);
      return { balance: fresh.balance, credited: 0, alreadyCredited: true };
    }
    throw err;
  }

  return { balance: wallet.balance, credited: parsed };
}

module.exports = {
  getOrCreateWallet,
  creditWallet,
  MAX_TOP_UP_AMOUNT,
};
