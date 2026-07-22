/**
 * Track Order flow: the tracking payload must always reflect the real
 * database state — no active order, awaiting payment, payment failed
 * (auto-voided), cancelled, delivered — and stale unpaid online orders
 * must never stay "active" forever.
 */
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const { Order } = require('../../src/customer-backend/models/Order');
const { Cart } = require('../../src/customer-backend/models/Cart');
const { Notification } = require('../../src/customer-backend/models/Notification');
const { WorldlinePayment } = require('../../src/customer-backend/models/WorldlinePayment');
const {
  getActiveOrder,
  getOrderTracking,
  updateCustomerOrderStatus,
} = require('../../src/customer-backend/services/orderService');

jest.setTimeout(120000);

let mongod;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
});

afterAll(async () => {
  await mongoose.disconnect();
  if (mongod) await mongod.stop();
});

afterEach(async () => {
  await Promise.all([
    Order.deleteMany({}),
    Cart.deleteMany({}),
    Notification.deleteMany({}),
    WorldlinePayment.deleteMany({}),
  ]);
});

function buildOrder(userId, overrides = {}) {
  return Order.create({
    userId,
    orderNumber: `SEL-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
    items: [
      {
        productId: new mongoose.Types.ObjectId(),
        productName: 'Test item',
        quantity: 2,
        price: 50,
      },
    ],
    status: 'pending',
    paymentStatus: 'pending',
    paymentMethod: { methodType: 'digital' },
    deliveryAddress: {
      line1: '1 Test Street',
      city: 'Chennai',
      state: 'TN',
      pincode: '600020',
      latitude: 13.0,
      longitude: 80.25,
    },
    timeline: [{ status: 'pending', timestamp: new Date(), actor: 'customer' }],
    itemTotal: 100,
    totalBill: 100,
    fulfillmentReleased: false,
    estimatedDelivery: new Date(Date.now() + 45 * 60 * 1000),
    ...overrides,
  });
}

async function backdate(orderId, minutes) {
  await Order.collection.updateOne(
    { _id: new mongoose.Types.ObjectId(String(orderId)) },
    { $set: { createdAt: new Date(Date.now() - minutes * 60 * 1000) } }
  );
}

function buildPaymentAttempt(order, overrides = {}) {
  return WorldlinePayment.create({
    userId: order.userId,
    orderId: order._id,
    idempotencyKey: `key-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
    merchantId: 'T_TEST',
    schemeCode: 'FIRST',
    platform: 'web',
    deviceId: 'WEBSH2',
    txnId: `TXN-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
    amountInr: 100,
    status: 'created',
    ...overrides,
  });
}

describe('no active order', () => {
  test('getActiveOrder returns null when the user has no orders', async () => {
    expect(await getActiveOrder(new mongoose.Types.ObjectId())).toBeNull();
  });

  test('getActiveOrder returns null when only old terminal orders exist', async () => {
    const userId = new mongoose.Types.ObjectId();
    const order = await buildOrder(userId, { status: 'delivered', paymentStatus: 'paid' });
    // Older than the 5-minute "recently finished" window
    await Order.collection.updateOne(
      { _id: order._id },
      { $set: { updatedAt: new Date(Date.now() - 10 * 60 * 1000) } }
    );
    expect(await getActiveOrder(userId)).toBeNull();
  });
});

describe('GET /orders/:id/tracking payload', () => {
  test('returns real order data with timeline, payment and coordinates', async () => {
    const userId = new mongoose.Types.ObjectId();
    const order = await buildOrder(userId, {
      status: 'confirmed',
      paymentStatus: 'paid',
      timeline: [
        { status: 'pending', timestamp: new Date(), actor: 'customer' },
        { status: 'confirmed', timestamp: new Date(), actor: 'system' },
      ],
    });

    const payload = await getOrderTracking(userId, String(order._id));
    expect(payload).toBeTruthy();
    expect(payload.id).toBe(String(order._id));
    expect(payload.orderNumber).toBe(order.orderNumber);
    expect(payload.status).toBe('confirmed');
    expect(payload.paymentStatus).toBe('paid');
    expect(payload.items).toHaveLength(1);
    expect(payload.items[0].productName).toBe('Test item');
    expect(payload.timeline.map((t) => t.status)).toEqual(['pending', 'confirmed']);
    expect(payload.addressCoordinates).toEqual({ latitude: 13.0, longitude: 80.25 });
    expect(payload.storeCoordinates).toBeTruthy();
    expect(typeof payload.deliveryTimeMinutes).toBe('number');
  });

  test("never returns another user's order", async () => {
    const owner = new mongoose.Types.ObjectId();
    const order = await buildOrder(owner);
    expect(await getOrderTracking(new mongoose.Types.ObjectId(), String(order._id))).toBeNull();
  });

  test('returns null for malformed ids', async () => {
    expect(await getOrderTracking(new mongoose.Types.ObjectId(), 'not-an-id')).toBeNull();
  });
});

describe('awaiting payment vs payment failed', () => {
  test('a fresh unpaid online order stays pending (awaiting payment)', async () => {
    const userId = new mongoose.Types.ObjectId();
    await buildOrder(userId);

    const payload = await getActiveOrder(userId);
    expect(payload.status).toBe('pending');
    expect(payload.paymentStatus).toBe('pending');
  });

  test('a stale unpaid online order with no gateway attempt is voided as payment failure', async () => {
    const userId = new mongoose.Types.ObjectId();
    const order = await buildOrder(userId);
    await backdate(order._id, 45); // beyond the 30-minute pending-payment TTL

    const payload = await getActiveOrder(userId);
    expect(payload.status).toBe('cancelled');
    expect(payload.paymentStatus).toBe('failed');

    const fresh = await Order.findById(order._id).lean();
    expect(fresh.status).toBe('cancelled');
    expect(fresh.paymentStatus).toBe('failed');
    expect(fresh.timeline.some((t) => t.status === 'cancelled')).toBe(true);
  });

  test('an abandoned attempt with an expired session is voided on read', async () => {
    const userId = new mongoose.Types.ObjectId();
    const order = await buildOrder(userId);
    await buildPaymentAttempt(order, {
      status: 'created',
      sessionExpiresAt: new Date(Date.now() - 5 * 60 * 1000),
    });
    await backdate(order._id, 45);

    const payload = await getActiveOrder(userId);
    // Voided as a payment failure and still visible (recent) for the
    // Payment Failed screen.
    expect(payload.status).toBe('cancelled');
    expect(payload.paymentStatus).toBe('failed');

    const attempt = await WorldlinePayment.findOne({ orderId: order._id }).lean();
    expect(attempt.status).toBe('failed');
  });

  test('an hours-old abandoned checkout no longer appears on Track Order at all', async () => {
    const userId = new mongoose.Types.ObjectId();
    const order = await buildOrder(userId);
    await buildPaymentAttempt(order, {
      status: 'created',
      sessionExpiresAt: new Date(Date.now() - 5 * 60 * 60 * 1000),
    });
    await backdate(order._id, 6 * 60); // 6 hours old

    expect(await getActiveOrder(userId)).toBeNull();

    const fresh = await Order.findById(order._id).lean();
    expect(fresh.status).toBe('cancelled');
    expect(fresh.paymentStatus).toBe('failed');
  });

  test('an attempt whose session is still open is left alone', async () => {
    const userId = new mongoose.Types.ObjectId();
    const order = await buildOrder(userId);
    await buildPaymentAttempt(order, {
      status: 'initiated',
      sessionExpiresAt: new Date(Date.now() + 20 * 60 * 1000),
    });

    const payload = await getActiveOrder(userId);
    expect(payload.status).toBe('pending');
    expect(payload.paymentStatus).toBe('pending');
  });

  test('a stale COD order is never voided by the payment guard', async () => {
    const userId = new mongoose.Types.ObjectId();
    const order = await buildOrder(userId, {
      paymentMethod: { methodType: 'cash' },
      paymentStatus: 'cod_pending',
      fulfillmentReleased: true,
    });
    await backdate(order._id, 120);

    const payload = await getActiveOrder(userId);
    expect(payload.status).toBe('pending');
    expect(payload.paymentStatus).toBe('cod_pending');
  });
});

describe('status lifecycle', () => {
  test('walks pending → confirmed → getting-packed → on-the-way → arrived → delivered', async () => {
    const userId = new mongoose.Types.ObjectId();
    const order = await buildOrder(userId, { paymentStatus: 'paid', fulfillmentReleased: true });

    for (const status of ['confirmed', 'getting-packed', 'on-the-way', 'arrived', 'delivered']) {
      const result = await updateCustomerOrderStatus(String(order._id), status);
      expect(result.error).toBeUndefined();
      expect(result.status).toBe(status);
    }

    const fresh = await Order.findById(order._id).lean();
    expect(fresh.status).toBe('delivered');
    expect(fresh.deliveredAt).toBeTruthy();
    expect(fresh.timeline.map((t) => t.status)).toEqual([
      'pending',
      'confirmed',
      'getting-packed',
      'on-the-way',
      'arrived',
      'delivered',
    ]);
  });

  test('COD payment completes on delivery (cod_pending → paid)', async () => {
    const userId = new mongoose.Types.ObjectId();
    const order = await buildOrder(userId, {
      status: 'arrived',
      paymentMethod: { methodType: 'cash' },
      paymentStatus: 'cod_pending',
      fulfillmentReleased: true,
    });

    const result = await updateCustomerOrderStatus(String(order._id), 'delivered');
    expect(result.error).toBeUndefined();

    const fresh = await Order.findById(order._id).lean();
    expect(fresh.paymentStatus).toBe('paid');
    expect(fresh.deliveredAt).toBeTruthy();
  });

  test('cancelled orders never transition again', async () => {
    const userId = new mongoose.Types.ObjectId();
    const order = await buildOrder(userId, { status: 'cancelled' });

    const result = await updateCustomerOrderStatus(String(order._id), 'confirmed');
    expect(result.error).toBeTruthy();
  });

  test('delivered orders never transition again', async () => {
    const userId = new mongoose.Types.ObjectId();
    const order = await buildOrder(userId, { status: 'delivered', paymentStatus: 'paid' });

    const result = await updateCustomerOrderStatus(String(order._id), 'cancelled');
    expect(result.error).toBeTruthy();
  });
});

describe('recently finished orders remain visible for redirect handling', () => {
  test('a just-cancelled order is returned with cancelled status only', async () => {
    const userId = new mongoose.Types.ObjectId();
    await buildOrder(userId, {
      status: 'cancelled',
      paymentStatus: 'failed',
      cancellationReason: 'Payment failed or cancelled',
    });

    const payload = await getActiveOrder(userId);
    expect(payload.status).toBe('cancelled');
    expect(payload.paymentStatus).toBe('failed');
    expect(payload.cancellationReason).toBe('Payment failed or cancelled');
  });

  test('a just-delivered order is returned with deliveredAt', async () => {
    const userId = new mongoose.Types.ObjectId();
    await buildOrder(userId, {
      status: 'delivered',
      paymentStatus: 'paid',
      deliveredAt: new Date(),
    });

    const payload = await getActiveOrder(userId);
    expect(payload.status).toBe('delivered');
    expect(payload.deliveredAt).toBeTruthy();
  });
});
