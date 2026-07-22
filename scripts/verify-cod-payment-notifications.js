/**
 * Verification for the COD payment-notification fix.
 * Creates synthetic user/orders/payments in the dev DB, exercises the real
 * service functions, asserts notification behaviour, then cleans everything up.
 *
 * Run: node scripts/verify-cod-payment-notifications.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../src/config/db');

const { Order } = require('../src/customer-backend/models/Order');
const { WorldlinePayment } = require('../src/customer-backend/models/WorldlinePayment');
const { Notification } = require('../src/customer-backend/models/Notification');
const { CustomerUser } = require('../src/customer-backend/models/CustomerUser');
const NotificationHistory = require('../src/admin/models/NotificationHistory');

const {
  sendOrderPlacementNotification,
  sendOrderStatusNotification,
  sendPaymentOutcomeNotification,
} = require('../src/customer-backend/services/notificationService');
const {
  maybeNotifyPaymentTimeout,
  createSession,
  getStatus,
} = require('../src/customer-backend/services/worldlinePaymentsService');
const { getPaymentRetryStatus } = require('../src/customer-backend/services/paymentRetryService');

let passed = 0;
let failed = 0;
function check(name, cond, detail = '') {
  if (cond) {
    passed += 1;
    console.log(`  PASS  ${name}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

async function notifTypes(userId) {
  const rows = await Notification.find({ userId }).sort({ createdAt: 1 }).lean();
  return rows.map((r) => r.data?.type);
}

async function clearNotifs(userId) {
  await Notification.deleteMany({ userId });
  await NotificationHistory.deleteMany({ userId: String(userId) });
}

function makeOrder(userId, methodType, overrides = {}) {
  return Order.create({
    userId,
    orderNumber: `TEST-${methodType.toUpperCase()}-${Date.now()}-${Math.floor(Math.random() * 1e5)}`,
    status: 'pending',
    items: [],
    paymentMethod: { methodType, last4: '' },
    paymentStatus: methodType === 'cash' ? 'cod_pending' : 'pending',
    itemTotal: 100,
    totalBill: 100,
    fulfillmentReleased: methodType === 'cash',
    ...overrides,
  });
}

function makePayment(userId, orderId, expiresAt, status = 'created') {
  return WorldlinePayment.create({
    userId,
    orderId,
    idempotencyKey: `test:${orderId}:web:1`,
    merchantId: 'TESTMID',
    schemeCode: 'FIRST',
    platform: 'web',
    deviceId: 'WEBSH2',
    txnId: `TEST-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
    attemptNo: 1,
    amountInr: 100,
    status,
    sessionExpiresAt: expiresAt,
  });
}

async function main() {
  await connectDB();

  const user = await CustomerUser.create({
    name: 'COD Notif Test User',
    phoneNumber: `9999${Date.now() % 1000000}`,
  });
  const userId = user._id;
  const createdOrderIds = [];

  try {
    // ---------------------------------------------------------------
    console.log('\n[1] COD order placed -> only COD_ORDER_PLACED');
    const cod = await makeOrder(userId, 'cash');
    createdOrderIds.push(cod._id);
    await sendOrderPlacementNotification(cod);
    let types = await notifTypes(userId);
    check('COD placement notification sent', types.includes('COD_ORDER_PLACED'), JSON.stringify(types));
    check('no payment notifications on COD placement', !types.some((t) => String(t).startsWith('PAYMENT')), JSON.stringify(types));

    // ---------------------------------------------------------------
    console.log('\n[2] COD order cancelled -> only ORDER_CANCELLED');
    cod.status = 'cancelled';
    cod.cancellationReason = 'test cancel';
    await cod.save();
    await sendOrderStatusNotification(cod, 'cancelled', { actor: 'customer' });
    types = await notifTypes(userId);
    check('cancellation notification sent', types.includes('ORDER_CANCELLED'), JSON.stringify(types));
    check('placement notification purged on cancel', !types.includes('COD_ORDER_PLACED'), JSON.stringify(types));
    check('no payment notifications after COD cancel', !types.some((t) => String(t).startsWith('PAYMENT')), JSON.stringify(types));

    // ---------------------------------------------------------------
    console.log('\n[3] COD order with orphaned expired payment session -> no PAYMENT_TIMEOUT');
    await clearNotifs(userId);
    const cod2 = await makeOrder(userId, 'cash');
    createdOrderIds.push(cod2._id);
    const orphanPayment = await makePayment(userId, cod2._id, new Date(Date.now() - 5 * 60 * 1000));
    await maybeNotifyPaymentTimeout(orphanPayment.toObject(), cod2.toObject());
    types = await notifTypes(userId);
    check('no timeout notification for COD order', types.length === 0, JSON.stringify(types));
    const claimed = await WorldlinePayment.findById(orphanPayment._id).lean();
    check('orphan attempt claimed silently (never fires later)', claimed.timeoutNotified === true);
    await getStatus(String(userId), { orderId: String(cod2._id) });
    types = await notifTypes(userId);
    check('getStatus on COD order sends nothing', types.length === 0, JSON.stringify(types));

    // ---------------------------------------------------------------
    console.log('\n[4] createSession / retry-status rejected for COD orders');
    const sessionResult = await createSession(String(userId), {
      orderId: String(cod2._id),
      platform: 'web',
    });
    check('createSession rejects COD order', Boolean(sessionResult.error), JSON.stringify(sessionResult));
    const retryResult = await getPaymentRetryStatus(String(cod2._id), String(userId));
    check('payment retry not available for COD order', retryResult.canRetry === false, JSON.stringify(retryResult));

    // ---------------------------------------------------------------
    console.log('\n[5] direct sendPaymentOutcomeNotification on COD order -> suppressed');
    await clearNotifs(userId);
    for (const outcome of ['failed', 'cancelled', 'timeout', 'pending']) {
      await sendPaymentOutcomeNotification(cod2, outcome);
    }
    types = await notifTypes(userId);
    check('all payment outcomes suppressed for COD', types.length === 0, JSON.stringify(types));

    // ---------------------------------------------------------------
    console.log('\n[6] online order, session expired recently -> PAYMENT_TIMEOUT still works (once)');
    await clearNotifs(userId);
    const online = await makeOrder(userId, 'digital', { fulfillmentReleased: false });
    createdOrderIds.push(online._id);
    const freshExpired = await makePayment(userId, online._id, new Date(Date.now() - 5 * 60 * 1000));
    await maybeNotifyPaymentTimeout(freshExpired.toObject(), online.toObject());
    types = await notifTypes(userId);
    check('timeout notification sent for online order', types.filter((t) => t === 'PAYMENT_TIMEOUT').length === 1, JSON.stringify(types));
    const sentBody = (await Notification.findOne({ userId, 'data.type': 'PAYMENT_TIMEOUT' }).lean())?.body || '';
    check('timeout message names the order', sentBody.includes(online.orderNumber), sentBody);
    await maybeNotifyPaymentTimeout(
      (await WorldlinePayment.findById(freshExpired._id).lean()),
      online.toObject()
    );
    types = await notifTypes(userId);
    check('timeout notification not duplicated', types.filter((t) => t === 'PAYMENT_TIMEOUT').length === 1, JSON.stringify(types));

    // ---------------------------------------------------------------
    console.log('\n[7] online order, session expired hours ago -> suppressed (no misattributed burst)');
    await clearNotifs(userId);
    const staleOnline = await makeOrder(userId, 'digital', { fulfillmentReleased: false });
    createdOrderIds.push(staleOnline._id);
    const stalePayment = await makePayment(userId, staleOnline._id, new Date(Date.now() - 3 * 60 * 60 * 1000));
    await maybeNotifyPaymentTimeout(stalePayment.toObject(), staleOnline.toObject());
    types = await notifTypes(userId);
    check('stale expiry suppressed', types.length === 0, JSON.stringify(types));

    // ---------------------------------------------------------------
    console.log('\n[8] cancelled online order with expired session -> suppressed');
    await clearNotifs(userId);
    const cancelledOnline = await makeOrder(userId, 'digital', {
      status: 'cancelled',
      fulfillmentReleased: false,
    });
    createdOrderIds.push(cancelledOnline._id);
    const cancelledPayment = await makePayment(userId, cancelledOnline._id, new Date(Date.now() - 5 * 60 * 1000));
    await maybeNotifyPaymentTimeout(cancelledPayment.toObject(), cancelledOnline.toObject());
    types = await notifTypes(userId);
    check('no timeout after order cancellation', types.length === 0, JSON.stringify(types));

    // ---------------------------------------------------------------
    console.log('\n[9] online payment outcomes still notify (failed/cancelled/pending)');
    await clearNotifs(userId);
    const online2 = await makeOrder(userId, 'digital', { fulfillmentReleased: false });
    createdOrderIds.push(online2._id);
    await sendPaymentOutcomeNotification(online2, 'failed');
    await sendPaymentOutcomeNotification(online2, 'cancelled');
    await sendPaymentOutcomeNotification(online2, 'pending');
    types = await notifTypes(userId);
    check(
      'online outcomes delivered',
      types.includes('PAYMENT_FAILED') && types.includes('PAYMENT_CANCELLED') && types.includes('PAYMENT_PENDING'),
      JSON.stringify(types)
    );
  } finally {
    // Cleanup all synthetic data
    await WorldlinePayment.deleteMany({ userId });
    await Notification.deleteMany({ userId });
    await NotificationHistory.deleteMany({ userId: String(userId) });
    await Order.deleteMany({ _id: { $in: createdOrderIds } });
    await CustomerUser.deleteOne({ _id: userId });
    console.log('\nCleanup complete.');
  }

  console.log(`\nRESULT: ${passed} passed, ${failed} failed`);
  await mongoose.disconnect();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(async (e) => {
  console.error(e);
  process.exit(1);
});
