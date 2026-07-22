/**
 * Temporary verification for the order-cancellation notification fix.
 * Exercises the real services against the DB with throwaway data, then cleans up.
 *
 * Usage: node scripts/tmp-notif-cancel-verify.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../src/config/db');
const { Order } = require('../src/customer-backend/models/Order');
const { Notification } = require('../src/customer-backend/models/Notification');
const {
  sendOrderPlacementNotification,
  sendOrderStatusNotification,
  sendPaymentOutcomeNotification,
} = require('../src/customer-backend/services/notificationService');
const { releaseOrderFulfillment } = require('../src/customer-backend/services/orderService');

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

function baseOrder(userId, overrides = {}) {
  return {
    userId,
    orderNumber: `TESTNOTIF-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
    items: [],
    status: 'pending',
    timeline: [{ status: 'pending', timestamp: new Date(), note: 'test', actor: 'customer' }],
    paymentMethod: { methodType: 'cash' },
    paymentStatus: 'cod_pending',
    itemTotal: 100,
    totalBill: 100,
    fulfillmentReleased: false,
    ...overrides,
  };
}

async function notifTypes(userId, orderId) {
  const docs = await Notification.find({ userId, 'data.orderId': String(orderId) })
    .sort({ createdAt: 1 })
    .lean();
  return docs.map((d) => `${d.data?.type}:"${d.title}"`);
}

async function main() {
  if (!process.env.MONGO_URI) throw new Error('MONGO_URI is required');
  await connectDB();
  console.log('Connected to MongoDB\n');

  const userId = new mongoose.Types.ObjectId();
  const orderIds = [];

  try {
    // Scenario 1: COD order placed, then cancelled by customer →
    // placement notification is written first, then purged on cancel.
    {
      const order = await Order.create(baseOrder(userId));
      orderIds.push(order._id);
      await sendOrderPlacementNotification(order);
      let types = await notifTypes(userId, order._id);
      check('S1: COD placement creates "Order Placed"', types.length === 1 && types[0].startsWith('COD_ORDER_PLACED'), types.join(', '));

      order.status = 'cancelled';
      await order.save();
      await sendOrderStatusNotification(order, 'cancelled', { actor: 'customer' });
      types = await notifTypes(userId, order._id);
      check(
        'S1: after customer cancel only ORDER_CANCELLED remains',
        types.length === 1 && types[0].startsWith('ORDER_CANCELLED'),
        types.join(', ')
      );
    }

    // Scenario 2: placement notification fires AFTER the order was cancelled
    // (async ORDER_CREATED listener racing an immediate cancel) → suppressed.
    {
      const order = await Order.create(baseOrder(userId, { status: 'cancelled' }));
      orderIds.push(order._id);
      await sendOrderPlacementNotification(order);
      const types = await notifTypes(userId, order._id);
      check('S2: placement suppressed for cancelled order', types.length === 0, types.join(', '));
    }

    // Scenario 3: online order cancelled, then a late gateway success tries to
    // release fulfillment → release refuses, no "Order Placed".
    {
      const order = await Order.create(
        baseOrder(userId, {
          status: 'cancelled',
          paymentMethod: { methodType: 'upi' },
          paymentStatus: 'paid',
          fulfillmentReleased: false,
        })
      );
      orderIds.push(order._id);
      const rel = await releaseOrderFulfillment(String(order._id));
      const types = await notifTypes(userId, order._id);
      check(
        'S3: releaseOrderFulfillment skips cancelled order',
        rel?.skipped === true && rel?.reason === 'cancelled',
        JSON.stringify(rel)
      );
      check('S3: no ORDER_PLACED after late payment success', types.length === 0, types.join(', '));
      const fresh = await Order.findById(order._id).lean();
      check('S3: order stays unreleased', fresh.fulfillmentReleased === false, `fulfillmentReleased=${fresh.fulfillmentReleased}`);
    }

    // Scenario 4: stale in-memory order (still "pending") but DB already cancelled —
    // payment success notification must check fresh status and stay silent.
    {
      const order = await Order.create(baseOrder(userId, { paymentMethod: { methodType: 'card' }, paymentStatus: 'paid' }));
      orderIds.push(order._id);
      const staleCopy = order; // in-memory status: pending
      await Order.updateOne({ _id: order._id }, { $set: { status: 'cancelled' } });
      await sendPaymentOutcomeNotification(staleCopy, 'success');
      const types = await notifTypes(userId, order._id);
      check('S4: stale success notification suppressed via fresh DB check', types.length === 0, types.join(', '));
    }

    // Scenario 5: admin/store cancellation purges placement and writes the
    // store-cancel wording only.
    {
      const order = await Order.create(baseOrder(userId, { paymentMethod: { methodType: 'wallet' }, paymentStatus: 'paid' }));
      orderIds.push(order._id);
      await sendOrderPlacementNotification(order);
      order.status = 'cancelled';
      await order.save();
      await sendOrderStatusNotification(order, 'cancelled', { actor: 'admin' });
      const types = await notifTypes(userId, order._id);
      check(
        'S5: admin cancel leaves only ORDER_CANCELLED_BY_STORE',
        types.length === 1 && types[0].startsWith('ORDER_CANCELLED_BY_STORE'),
        types.join(', ')
      );
    }

    // Scenario 6: normal (non-cancelled) flow is unaffected — paid online order
    // release still emits exactly one "Order Placed".
    {
      const order = await Order.create(
        baseOrder(userId, { paymentMethod: { methodType: 'card' }, paymentStatus: 'paid', fulfillmentReleased: false })
      );
      orderIds.push(order._id);
      const rel = await releaseOrderFulfillment(String(order._id));
      const relAgain = await releaseOrderFulfillment(String(order._id));
      const types = await notifTypes(userId, order._id);
      check(
        'S6: healthy paid order still gets exactly one ORDER_PLACED',
        rel?.ok === true && relAgain?.skipped === true && types.length === 1 && types[0].startsWith('ORDER_PLACED'),
        `rel=${JSON.stringify(rel)} again=${JSON.stringify(relAgain)} notifs=${types.join(', ')}`
      );
    }
  } finally {
    const idStrings = orderIds.map(String);
    await Order.deleteMany({ _id: { $in: orderIds } });
    await Notification.deleteMany({ userId });
    // Best-effort cleanup of side records written by the full release path (S6).
    for (const [path, filter] of [
      ['../src/admin/models/NotificationHistory', { userId: String(userId) }],
      ['../src/darkstore/models/Order', { order_id: { $in: idStrings } }],
      ['../src/warehouse/models/Order', { order_id: { $in: idStrings } }],
      ['../src/finance/models/CustomerPayment', { orderId: { $in: idStrings } }],
      ['../src/finance/models/LiveTransaction', { orderId: { $in: idStrings } }],
    ]) {
      try {
        const mod = require(path);
        const Model = mod?.deleteMany ? mod : Object.values(mod)[0];
        if (Model?.deleteMany) await Model.deleteMany(filter);
      } catch { /* best-effort cleanup */ }
    }
    await mongoose.disconnect();
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
