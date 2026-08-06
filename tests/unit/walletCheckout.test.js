/**
 * Selorg Wallet checkout: atomic debit, idempotency, and void-refund rollback.
 */
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const { CustomerWallet } = require('../../src/customer-backend/models/CustomerWallet');
const { WalletTransaction } = require('../../src/customer-backend/models/WalletTransaction');
const {
  debitWalletForOrder,
  refundWalletForFailedOrderPayment,
  getOrCreateWallet,
  roundInr,
} = require('../../src/customer-backend/services/walletService');

jest.setTimeout(120000);

let mongod;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  // Only sync the ledger unique index we rely on for idempotency.
  await WalletTransaction.syncIndexes();
});

afterAll(async () => {
  await mongoose.disconnect();
  if (mongod) await mongod.stop();
});

afterEach(async () => {
  await Promise.all([CustomerWallet.deleteMany({}), WalletTransaction.deleteMany({})]);
});

describe('walletService debitWalletForOrder', () => {
  test('debits atomically and records order_payment ledger', async () => {
    const userId = new mongoose.Types.ObjectId();
    const orderId = new mongoose.Types.ObjectId();
    await CustomerWallet.create({ customerId: userId, balance: 500, isActive: true });

    const result = await debitWalletForOrder(userId, 120.5, orderId);
    expect(result.error).toBeUndefined();
    expect(result.deducted).toBe(120.5);
    expect(result.balance).toBe(379.5);
    expect(result.alreadyDebited).toBe(false);

    const wallet = await CustomerWallet.findOne({ customerId: userId }).lean();
    expect(wallet.balance).toBe(379.5);

    const txns = await WalletTransaction.find({ customerId: userId }).lean();
    expect(txns).toHaveLength(1);
    expect(txns[0].source).toBe('order_payment');
    expect(txns[0].referenceId).toBe(String(orderId));
    expect(txns[0].type).toBe('debit');
  });

  test('is idempotent for the same orderId', async () => {
    const userId = new mongoose.Types.ObjectId();
    const orderId = new mongoose.Types.ObjectId();
    await CustomerWallet.create({ customerId: userId, balance: 200, isActive: true });

    const first = await debitWalletForOrder(userId, 80, orderId);
    const second = await debitWalletForOrder(userId, 80, orderId);

    expect(first.alreadyDebited).toBe(false);
    expect(second.alreadyDebited).toBe(true);
    expect(second.deducted).toBe(80);

    const wallet = await CustomerWallet.findOne({ customerId: userId }).lean();
    expect(wallet.balance).toBe(120);
    expect(await WalletTransaction.countDocuments({ customerId: userId })).toBe(1);
  });

  test('rejects insufficient balance without mutating wallet', async () => {
    const userId = new mongoose.Types.ObjectId();
    const orderId = new mongoose.Types.ObjectId();
    await CustomerWallet.create({ customerId: userId, balance: 40, isActive: true });

    const result = await debitWalletForOrder(userId, 100, orderId);
    expect(result.error).toMatch(/insufficient/i);

    const wallet = await CustomerWallet.findOne({ customerId: userId }).lean();
    expect(wallet.balance).toBe(40);
    expect(await WalletTransaction.countDocuments({ customerId: userId })).toBe(0);
  });

  test('concurrent debits for different orders do not overdraft', async () => {
    const userId = new mongoose.Types.ObjectId();
    await CustomerWallet.create({ customerId: userId, balance: 100, isActive: true });

    const results = await Promise.all([
      debitWalletForOrder(userId, 70, new mongoose.Types.ObjectId()),
      debitWalletForOrder(userId, 70, new mongoose.Types.ObjectId()),
      debitWalletForOrder(userId, 70, new mongoose.Types.ObjectId()),
    ]);

    const successes = results.filter((r) => !r.error);
    const failures = results.filter((r) => r.error);
    expect(successes).toHaveLength(1);
    expect(failures).toHaveLength(2);

    const wallet = await getOrCreateWallet(userId);
    expect(roundInr(wallet.balance)).toBe(30);
  });
});

describe('walletService refundWalletForFailedOrderPayment', () => {
  test('restores balance after partial-wallet void and is idempotent', async () => {
    const userId = new mongoose.Types.ObjectId();
    const orderId = new mongoose.Types.ObjectId();
    await CustomerWallet.create({ customerId: userId, balance: 300, isActive: true });

    await debitWalletForOrder(userId, 90, orderId);
    const refund1 = await refundWalletForFailedOrderPayment(userId, 90, orderId);
    expect(refund1.error).toBeUndefined();
    expect(refund1.credited).toBe(90);

    const refund2 = await refundWalletForFailedOrderPayment(userId, 90, orderId);
    expect(refund2.alreadyCredited).toBe(true);

    const wallet = await CustomerWallet.findOne({ customerId: userId }).lean();
    expect(wallet.balance).toBe(300);

    const credits = await WalletTransaction.find({
      customerId: userId,
      type: 'credit',
    }).lean();
    expect(credits).toHaveLength(1);
    expect(credits[0].referenceId).toBe(`wallet-void:${String(orderId)}`);
  });

  test('skips refund when no prior debit exists', async () => {
    const userId = new mongoose.Types.ObjectId();
    await CustomerWallet.create({ customerId: userId, balance: 50, isActive: true });
    const result = await refundWalletForFailedOrderPayment(
      userId,
      25,
      new mongoose.Types.ObjectId()
    );
    expect(result.skipped).toBe(true);
    const wallet = await CustomerWallet.findOne({ customerId: userId }).lean();
    expect(wallet.balance).toBe(50);
  });
});
