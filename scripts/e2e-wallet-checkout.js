/**
 * E2E verification for Selorg Wallet checkout (service-level, against live Mongo).
 * Uses the same DNS/mongo setup as the server.
 */
require('dotenv').config();
const dns = require('dns');
dns.setServers(['8.8.8.8', '1.1.1.1']);

const mongoose = require('mongoose');

async function main() {
  const { connectDB } = require('../src/config/db');
  // connectDB may start listeners — connect directly like tests
  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error('MONGO_URI missing');

  // Resolve SRV similarly to server if needed
  let connectUri = uri;
  try {
    const { resolveSrv } = require('../src/config/db');
  } catch (_) {}

  await mongoose.connect(uri);
  console.log('connected', mongoose.connection.name);

  const { CustomerUser } = require('../src/customer-backend/models/CustomerUser');
  const { CustomerWallet } = require('../src/customer-backend/models/CustomerWallet');
  const { WalletTransaction } = require('../src/customer-backend/models/WalletTransaction');
  const { Order } = require('../src/customer-backend/models/Order');
  const { AppConfig } = require('../src/customer-backend/models/AppConfig');
  const {
    debitWalletForOrder,
    refundWalletForFailedOrderPayment,
    creditWallet,
    getOrCreateWallet,
  } = require('../src/customer-backend/services/walletService');
  const { refundWalletDeductionOnVoid } = require('../src/customer-backend/services/orderService');

  await WalletTransaction.syncIndexes().catch((e) => console.warn('index sync', e.message));

  const cfg = await AppConfig.findOne({ key: 'default' }).lean();
  const methods = (cfg?.paymentMethods || []).map((m) => m.key);
  console.log('AppConfig methods:', methods.join(', '));
  if (!methods.includes('wallet') && !methods.includes('selorg_wallet')) {
    // Persist from public normalizer list
    const { normalizePublicConfig } = require('../src/customer-backend/controllers/admin/appConfigAdminController');
    const normalized = normalizePublicConfig(cfg || {});
    await AppConfig.updateOne(
      { key: 'default' },
      { $set: { paymentMethods: normalized.paymentMethods } },
      { upsert: true }
    );
    console.log('Persisted wallet method into AppConfig');
  }

  let user = await CustomerUser.findOne().sort({ updatedAt: -1 });
  if (!user) {
    user = await CustomerUser.create({
      phoneNumber: `9${Date.now().toString().slice(-9)}`,
      name: 'Wallet E2E Test',
    });
    console.log('Created test user', user._id);
  } else {
    console.log('Using user', user._id.toString());
  }

  const wallet = await getOrCreateWallet(user._id);
  // Ensure enough balance for tests
  if (wallet.balance < 500) {
    await creditWallet(user._id, 500, {
      source: 'manual_credit',
      description: 'E2E top-up',
      referenceId: `e2e-topup-${Date.now()}`,
      referenceType: 'manual',
    });
  }
  const before = (await getOrCreateWallet(user._id)).balance;
  console.log('Wallet balance before:', before);

  // Full debit
  const orderFull = new mongoose.Types.ObjectId();
  const fullAmt = 120;
  const d1 = await debitWalletForOrder(user._id, fullAmt, orderFull, {
    description: 'E2E full wallet',
  });
  console.log('Full debit:', d1);
  if (d1.error) throw new Error(d1.error);

  // Idempotent
  const d1b = await debitWalletForOrder(user._id, fullAmt, orderFull);
  console.log('Idempotent debit:', d1b.alreadyDebited === true);

  // Partial + void restore
  const orderPartial = new mongoose.Types.ObjectId();
  const partialAmt = 80;
  const d2 = await debitWalletForOrder(user._id, partialAmt, orderPartial, {
    description: 'E2E partial wallet',
  });
  console.log('Partial debit:', d2);

  await Order.create({
    _id: orderPartial,
    userId: user._id,
    orderNumber: `E2E-${Date.now()}`,
    items: [{ productId: new mongoose.Types.ObjectId(), productName: 'E2E', quantity: 1, price: 200 }],
    status: 'pending',
    paymentStatus: 'pending',
    paymentMethod: { methodType: 'digital' },
    walletDeduction: partialAmt,
    onlineAmountDue: 120,
    itemTotal: 200,
    totalBill: 200,
    fulfillmentReleased: false,
  });

  const voided = await refundWalletDeductionOnVoid(
    await Order.findById(orderPartial).lean()
  );
  console.log('Void restore:', voided);

  const after = (await getOrCreateWallet(user._id)).balance;
  console.log('Wallet balance after (expect ~ before - fullAmt):', after, 'expected', before - fullAmt);

  const txns = await WalletTransaction.find({ customerId: user._id })
    .sort({ createdAt: -1 })
    .limit(5)
    .lean();
  console.log(
    'Recent txns:',
    txns.map((t) => ({ type: t.type, source: t.source, amount: t.amount, ref: t.referenceId }))
  );

  const ok =
    Math.abs(after - (before - fullAmt)) < 0.01 &&
    d1b.alreadyDebited === true &&
    (voided.ok || voided.alreadyCredited || voided.credited > 0);
  console.log(ok ? 'E2E PASS' : 'E2E FAIL');
  await mongoose.disconnect();
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
