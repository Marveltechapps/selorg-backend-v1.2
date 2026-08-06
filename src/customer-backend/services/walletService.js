const { CustomerWallet } = require('../models/CustomerWallet');
const { WalletTransaction } = require('../models/WalletTransaction');

const MAX_TOP_UP_AMOUNT = Number(process.env.WALLET_MAX_TOP_UP_AMOUNT) || 10000;

function roundInr(amount) {
  return Math.round((Number(amount) || 0) * 100) / 100;
}

function voidRefundReferenceId(orderId) {
  return `wallet-void:${String(orderId)}`;
}

async function getOrCreateWallet(customerId, session = null) {
  const query = CustomerWallet.findOne({ customerId });
  if (session) query.session(session);
  let wallet = await query;
  if (!wallet) {
    const created = await CustomerWallet.create(
      [{ customerId, balance: 0 }],
      session ? { session } : undefined
    );
    wallet = Array.isArray(created) ? created[0] : created;
  }
  return wallet;
}

/**
 * Credit a customer wallet and record a transaction (shared by top-up and admin flows).
 * Top-up / manual credits are capped; refunds and order void reversals are not.
 */
async function creditWallet(customerId, amount, meta = {}) {
  const parsed = roundInr(amount);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return { error: 'Invalid amount' };
  }

  const {
    source = 'manual_credit',
    description = 'Wallet top-up',
    referenceId,
    referenceType = 'manual',
    session = null,
  } = meta;

  const cappedSources = new Set(['payment_topup', 'manual_credit', 'promotional', 'cashback', 'goodwill']);
  if (cappedSources.has(source) && parsed > MAX_TOP_UP_AMOUNT) {
    return { error: `Amount cannot exceed ₹${MAX_TOP_UP_AMOUNT}` };
  }

  // Idempotent payment top-ups keyed by gateway txn id.
  if (source === 'payment_topup' && referenceId) {
    const existingQuery = WalletTransaction.findOne({
      customerId,
      source: 'payment_topup',
      referenceId: String(referenceId),
    });
    if (session) existingQuery.session(session);
    const existing = await existingQuery.lean();
    if (existing) {
      const wallet = await getOrCreateWallet(customerId, session);
      return { balance: wallet.balance, credited: 0, alreadyCredited: true };
    }
  }

  // Idempotent void/cancel rollbacks keyed by order id reference.
  if (source === 'refund' && referenceId) {
    const existingQuery = WalletTransaction.findOne({
      customerId,
      source: 'refund',
      referenceId: String(referenceId),
    });
    if (session) existingQuery.session(session);
    const existing = await existingQuery.lean();
    if (existing) {
      const wallet = await getOrCreateWallet(customerId, session);
      return { balance: wallet.balance, credited: 0, alreadyCredited: true };
    }
  }

  const wallet = await getOrCreateWallet(customerId, session);
  if (!wallet.isActive) {
    return { error: 'Wallet not available' };
  }

  const balanceBefore = wallet.balance;
  wallet.balance = roundInr(wallet.balance + parsed);
  wallet.lastTransactionAt = new Date();
  await wallet.save(session ? { session } : undefined);

  try {
    await WalletTransaction.create(
      [
        {
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
        },
      ],
      session ? { session } : undefined
    );
  } catch (err) {
    if (err && (err.code === 11000 || String(err.message || '').includes('duplicate'))) {
      // Lost a race — reverse the balance bump we just applied.
      wallet.balance = Math.max(0, roundInr(wallet.balance - parsed));
      await wallet.save(session ? { session } : undefined);
      const fresh = await getOrCreateWallet(customerId, session);
      return { balance: fresh.balance, credited: 0, alreadyCredited: true };
    }
    throw err;
  }

  return { balance: wallet.balance, credited: parsed };
}

/**
 * Atomically debit wallet for an order payment.
 * Idempotent on (customerId, source=order_payment, referenceId=orderId).
 */
async function debitWalletForOrder(customerId, amount, orderId, meta = {}) {
  const parsed = roundInr(amount);
  const orderRef = String(orderId || '').trim();
  if (!orderRef) return { error: 'Order id required for wallet debit' };
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return { error: 'Invalid wallet debit amount' };
  }

  const {
    description = 'Payment for order',
    session = null,
  } = meta;

  const existingQuery = WalletTransaction.findOne({
    customerId,
    source: 'order_payment',
    referenceId: orderRef,
  });
  if (session) existingQuery.session(session);
  const existing = await existingQuery.lean();
  if (existing) {
    const wallet = await getOrCreateWallet(customerId, session);
    return {
      balance: wallet.balance,
      deducted: Number(existing.amount) || parsed,
      alreadyDebited: true,
    };
  }

  // Atomic conditional debit — prevents overdraft under concurrent checkouts.
  const updated = await CustomerWallet.findOneAndUpdate(
    {
      customerId,
      isActive: true,
      balance: { $gte: parsed },
    },
    {
      $inc: { balance: -parsed },
      $set: { lastTransactionAt: new Date() },
    },
    {
      new: true,
      ...(session ? { session } : {}),
    }
  );

  if (!updated) {
    const wallet = await getOrCreateWallet(customerId, session);
    if (!wallet.isActive) return { error: 'Wallet not available' };
    return { error: 'Insufficient wallet balance' };
  }

  const balanceAfter = roundInr(updated.balance);
  const balanceBefore = roundInr(balanceAfter + parsed);

  try {
    await WalletTransaction.create(
      [
        {
          walletId: updated._id,
          customerId,
          type: 'debit',
          amount: parsed,
          balanceBefore,
          balanceAfter,
          source: 'order_payment',
          referenceId: orderRef,
          referenceType: 'order',
          description,
        },
      ],
      session ? { session } : undefined
    );
  } catch (err) {
    if (err && (err.code === 11000 || String(err.message || '').includes('duplicate'))) {
      // Another request already wrote the ledger — reverse this debit.
      await CustomerWallet.updateOne(
        { _id: updated._id },
        { $inc: { balance: parsed } },
        session ? { session } : undefined
      );
      const wallet = await getOrCreateWallet(customerId, session);
      return {
        balance: wallet.balance,
        deducted: parsed,
        alreadyDebited: true,
      };
    }
    // Ledger write failed after balance change — restore funds.
    await CustomerWallet.updateOne(
      { _id: updated._id },
      { $inc: { balance: parsed } },
      session ? { session } : undefined
    );
    throw err;
  }

  return { balance: balanceAfter, deducted: parsed, alreadyDebited: false };
}

/**
 * Refund a prior order_payment debit when online payment fails/cancels (partial wallet).
 * Idempotent via referenceId wallet-void:{orderId}.
 */
async function refundWalletForFailedOrderPayment(customerId, amount, orderId, meta = {}) {
  const parsed = roundInr(amount);
  const orderRef = String(orderId || '').trim();
  if (!orderRef) return { error: 'Order id required for wallet refund' };
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return { skipped: true, credited: 0 };
  }

  const { description = 'Wallet restored after payment failed', session = null } = meta;

  // Only refund if a debit exists for this order.
  const debitQuery = WalletTransaction.findOne({
    customerId,
    source: 'order_payment',
    referenceId: orderRef,
  });
  if (session) debitQuery.session(session);
  const debit = await debitQuery.lean();
  if (!debit) {
    return { skipped: true, credited: 0, reason: 'no_debit' };
  }

  const refundAmount = roundInr(Math.min(parsed, Number(debit.amount) || parsed));

  return creditWallet(customerId, refundAmount, {
    source: 'refund',
    description,
    referenceId: voidRefundReferenceId(orderRef),
    referenceType: 'order',
    session,
  });
}

module.exports = {
  getOrCreateWallet,
  creditWallet,
  debitWalletForOrder,
  refundWalletForFailedOrderPayment,
  voidRefundReferenceId,
  roundInr,
  MAX_TOP_UP_AMOUNT,
};
