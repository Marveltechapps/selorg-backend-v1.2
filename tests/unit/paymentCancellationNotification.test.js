/**
 * Payment cancellation must create exactly ONE notification, immediately,
 * no matter how many concurrent handlers (app complete + gateway return +
 * browser return + reconcile) report the same cancel.
 */
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const { Order } = require('../../src/customer-backend/models/Order');
const { Notification } = require('../../src/customer-backend/models/Notification');
const { Cart } = require('../../src/customer-backend/models/Cart');
const { sendPushNotification, sendPaymentOutcomeNotification } = require('../../src/customer-backend/services/notificationService');
const { voidUnpaidOnlineOrder } = require('../../src/customer-backend/services/orderService');

jest.setTimeout(120000);

let mongod;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  // The unique partial index on dedupeKey is what enforces exactly-once.
  await Notification.syncIndexes();
});

afterAll(async () => {
  await mongoose.disconnect();
  if (mongod) await mongod.stop();
});

afterEach(async () => {
  await Promise.all([
    Order.deleteMany({}),
    Notification.deleteMany({}),
    Cart.deleteMany({}),
  ]);
});

function buildOrder(userId) {
  return Order.create({
    userId,
    orderNumber: `SEL-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
    items: [
      {
        productId: new mongoose.Types.ObjectId(),
        productName: 'Test item',
        quantity: 1,
        price: 100,
      },
    ],
    status: 'pending',
    paymentStatus: 'pending',
    paymentMethod: { methodType: 'digital' },
    itemTotal: 100,
    totalBill: 100,
  });
}

describe('idempotent notification creation (dedupeKey)', () => {
  test('concurrent sends with the same dedupeKey create exactly one notification', async () => {
    const userId = new mongoose.Types.ObjectId();
    const dedupeKey = `payment-outcome:${new mongoose.Types.ObjectId()}:PAYMENT_CANCELLED`;

    const results = await Promise.all([
      sendPushNotification(userId, 'PAYMENT_CANCELLED', { orderNumber: 'A1' }, { dedupeKey }),
      sendPushNotification(userId, 'PAYMENT_CANCELLED', { orderNumber: 'A1' }, { dedupeKey }),
      sendPushNotification(userId, 'PAYMENT_CANCELLED', { orderNumber: 'A1' }, { dedupeKey }),
    ]);

    const docs = await Notification.find({ userId }).lean();
    expect(docs).toHaveLength(1);
    expect(docs[0].dedupeKey).toBe(dedupeKey);
    expect(results.filter((r) => r && r.skipped && r.reason === 'duplicate')).toHaveLength(2);

    // A later replay (e.g. reconciliation) is also skipped.
    const replay = await sendPushNotification(userId, 'PAYMENT_CANCELLED', { orderNumber: 'A1' }, { dedupeKey });
    expect(replay.skipped).toBe(true);
    expect(await Notification.countDocuments({ userId })).toBe(1);
  });

  test('notifications without a dedupeKey are unaffected', async () => {
    const userId = new mongoose.Types.ObjectId();
    await sendPushNotification(userId, 'ORDER_CONFIRMED', { orderNumber: 'A2' });
    await sendPushNotification(userId, 'ORDER_CONFIRMED', { orderNumber: 'A2' });
    expect(await Notification.countDocuments({ userId })).toBe(2);
  });

  test('sendPaymentOutcomeNotification dedupes terminal outcomes per order', async () => {
    const userId = new mongoose.Types.ObjectId();
    const order = await buildOrder(userId);
    order.status = 'cancelled';

    await Promise.all([
      sendPaymentOutcomeNotification(order, 'cancelled', { reason: 'x' }),
      sendPaymentOutcomeNotification(order, 'cancelled', { reason: 'x' }),
      sendPaymentOutcomeNotification(order, 'cancelled', { reason: 'x' }),
    ]);

    const docs = await Notification.find({ userId, 'data.type': 'PAYMENT_CANCELLED' }).lean();
    expect(docs).toHaveLength(1);
    expect(docs[0].body).toContain('Payment was cancelled');
  });
});

describe('voidUnpaidOnlineOrder exactly-once cancel', () => {
  test('three concurrent void calls produce one cancelled transition and one notification', async () => {
    const userId = new mongoose.Types.ObjectId();
    const order = await buildOrder(userId);

    await Promise.all([
      voidUnpaidOnlineOrder(String(userId), String(order._id), 'Payment cancelled by user', 'cancelled'),
      voidUnpaidOnlineOrder(String(userId), String(order._id), 'Payment cancelled by user', 'cancelled'),
      voidUnpaidOnlineOrder(String(userId), String(order._id), 'Payment cancelled by user', 'cancelled'),
    ]);

    const fresh = await Order.findById(order._id).lean();
    expect(fresh.status).toBe('cancelled');
    expect(fresh.paymentStatus).toBe('failed');
    // Only the claim winner appends the cancelled timeline entry.
    expect(fresh.timeline.filter((t) => t.status === 'cancelled')).toHaveLength(1);
    // Cart restore claimed exactly once.
    expect(fresh.cartRestoredAt).toBeTruthy();

    const notifications = await Notification.find({ userId }).lean();
    const cancelled = notifications.filter((n) => n.data?.type === 'PAYMENT_CANCELLED');
    expect(cancelled).toHaveLength(1);
  });

  test('sequential replays (webhook retry / reconcile) never re-notify', async () => {
    const userId = new mongoose.Types.ObjectId();
    const order = await buildOrder(userId);

    await voidUnpaidOnlineOrder(String(userId), String(order._id), 'Payment cancelled by user', 'cancelled');
    const second = await voidUnpaidOnlineOrder(String(userId), String(order._id), 'Payment cancelled by user', 'cancelled');
    const third = await voidUnpaidOnlineOrder(String(userId), String(order._id), 'Payment cancelled by user', 'cancelled');

    expect(second.skipped).toBe(true);
    expect(third.skipped).toBe(true);
    expect(await Notification.countDocuments({ userId, 'data.type': 'PAYMENT_CANCELLED' })).toBe(1);
  });

  test('a paid order is never voided or notified', async () => {
    const userId = new mongoose.Types.ObjectId();
    const order = await buildOrder(userId);
    order.paymentStatus = 'paid';
    await order.save();

    await voidUnpaidOnlineOrder(String(userId), String(order._id), 'stale callback', 'cancelled');

    const fresh = await Order.findById(order._id).lean();
    expect(fresh.status).toBe('pending');
    expect(fresh.paymentStatus).toBe('paid');
    expect(await Notification.countDocuments({ userId })).toBe(0);
  });
});
