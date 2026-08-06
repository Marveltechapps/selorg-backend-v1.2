/**
 * One-shot: ensure AppConfig has Selorg Wallet payment method + sync wallet ledger indexes.
 * Usage: node scripts/ensure-wallet-payment-method.js
 */
require('dotenv').config();
const mongoose = require('mongoose');

async function main() {
  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error('MONGO_URI missing');
  await mongoose.connect(uri);

  const { AppConfig, DEFAULT_APP_CONFIG } = require('../src/customer-backend/models/AppConfig');
  const { WalletTransaction } = require('../src/customer-backend/models/WalletTransaction');

  const existing = await AppConfig.findOne();
  if (!existing) {
    console.log('No AppConfig found — creating defaults');
    await AppConfig.create(DEFAULT_APP_CONFIG);
  } else {
    const paymentMethods = Array.isArray(existing.paymentMethods) ? existing.paymentMethods : [];
    const hasWallet = paymentMethods.some((m) =>
      ['wallet', 'selorg_wallet'].includes(String(m?.key || '').toLowerCase())
    );
    if (!hasWallet) {
      const walletMethod = (DEFAULT_APP_CONFIG.paymentMethods || []).find(
        (m) => String(m.key).toLowerCase() === 'wallet'
      ) || {
        key: 'wallet',
        label: 'Selorg Wallet',
        description: 'Pay with your Selorg Wallet balance',
        icon: 'wallet',
        imageUrl: '',
        isActive: true,
        order: 0,
      };
      existing.paymentMethods = [
        { ...walletMethod, isActive: true, order: 0 },
        ...paymentMethods.map((m, idx) => ({
          ...(m.toObject ? m.toObject() : m),
          order: typeof m.order === 'number' ? m.order + 1 : idx + 1,
        })),
      ];
      existing.markModified('paymentMethods');
      await existing.save();
      console.log('Added Selorg Wallet payment method to AppConfig');
    } else {
      // Ensure active
      let changed = false;
      existing.paymentMethods = paymentMethods.map((m) => {
        const key = String(m?.key || '').toLowerCase();
        if (key === 'wallet' || key === 'selorg_wallet') {
          if (!m.isActive) {
            changed = true;
            return { ...(m.toObject ? m.toObject() : m), isActive: true };
          }
        }
        return m.toObject ? m.toObject() : m;
      });
      if (changed) {
        existing.markModified('paymentMethods');
        await existing.save();
        console.log('Activated existing Selorg Wallet payment method');
      } else {
        console.log('Selorg Wallet payment method already present');
      }
    }
  }

  const fresh = await AppConfig.findOne().lean();
  console.log(
    'paymentMethods:',
    JSON.stringify(
      (fresh.paymentMethods || []).map((m) => ({ key: m.key, label: m.label, isActive: m.isActive, order: m.order })),
      null,
      2
    )
  );

  try {
    await WalletTransaction.syncIndexes();
    console.log('WalletTransaction indexes synced');
  } catch (err) {
    console.warn('WalletTransaction.syncIndexes warning:', err.message);
  }

  await mongoose.disconnect();
  console.log('Done');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
