const NotificationHistory = require('../../admin/models/NotificationHistory');
const { PushToken } = require('../models/PushToken');
const { Notification } = require('../models/Notification');
const logger = require('../../core/utils/logger');

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

const NOTIFICATION_TYPES = {
  // Order placement — sent only after payment is actually confirmed (or COD/wallet confirmed).
  ORDER_PLACED: { title: 'Order Placed', template: 'Your order #{orderNumber} has been placed successfully.' },
  ORDER_AWAITING_PAYMENT: { title: 'Awaiting Payment', template: 'Your order #{orderNumber} has been created and is awaiting payment.' },
  COD_ORDER_PLACED: { title: 'Order Placed', template: 'Your Cash on Delivery order #{orderNumber} has been placed successfully.' },
  WALLET_ORDER_PLACED: { title: 'Order Placed', template: 'Order placed successfully.' },
  // Payment outcomes — sent only after the gateway result is verified server-side.
  PAYMENT_FAILED: { title: 'Payment Failed', template: 'Payment failed. Your order #{orderNumber} was not confirmed.' },
  PAYMENT_CANCELLED: {
    title: 'Payment Cancelled',
    template:
      'Your payment was cancelled. No amount has been deducted. You can try again anytime.',
  },
  PAYMENT_TIMEOUT: { title: 'Payment Session Expired', template: 'Payment session expired for order #{orderNumber}. Please retry payment.' },
  PAYMENT_PENDING: { title: 'Payment Pending', template: 'Your payment for order #{orderNumber} is being verified.' },
  PAYMENT_RETRY_AVAILABLE: { title: 'Retry Payment?', template: 'Your payment for order #{orderNumber} can be retried now.' },
  WALLET_PAYMENT_FAILED: { title: 'Wallet Payment Failed', template: 'Wallet payment failed.' },
  // Order lifecycle
  ORDER_CONFIRMED: { title: 'Order Confirmed', template: 'Your order #{orderNumber} has been confirmed.' },
  ORDER_PACKED: { title: 'Order Packed', template: 'Your order #{orderNumber} has been packed.' },
  ORDER_ON_WAY: { title: 'Out for Delivery', template: 'Your order #{orderNumber} is out for delivery.' },
  ORDER_ARRIVED: { title: 'Rider Arrived', template: 'Your rider has arrived with order #{orderNumber}. OTP: {otp}' },
  ORDER_DELIVERED: { title: 'Order Delivered', template: 'Your order #{orderNumber} has been delivered.' },
  ORDER_CANCELLED: { title: 'Order Cancelled', template: 'Your order #{orderNumber} has been cancelled. {reason}' },
  ORDER_CANCELLED_BY_STORE: { title: 'Order Cancelled', template: 'Your order #{orderNumber} was cancelled by the store. {reason}' },
  // Refunds
  REFUND_INITIATED: { title: 'Refund Initiated', template: 'Your refund has been initiated.' },
  REFUND_APPROVED: { title: 'Refund Approved', template: 'Your refund of ₹{amount} for order #{orderNumber} has been approved' },
  REFUND_COMPLETED: { title: 'Refund Completed', template: 'Your refund has been processed successfully. ₹{amount} has been credited to your {method}.' },
  REFUND_REJECTED: { title: 'Refund Update', template: 'Your refund request for order #{orderNumber} could not be processed. {reason}' },
  WALLET_CREDIT: { title: 'Wallet Credited', template: '₹{amount} has been added to your wallet. New balance: ₹{balance}' },
  SUPPORT_REPLY: { title: 'Support Update', template: 'Support replied to your ticket #{ticketId}' },
  DELIVERY_DELAYED: { title: 'Delivery Delayed', template: 'Your order #{orderNumber} is delayed. New ETA: {eta}. We apologize!' },
  DELIVERY_SLA_BREACH: { title: 'SLA Breach - Compensation Issued', template: 'Your order #{orderNumber} was delayed by {delayMins} mins. ₹{compensation} has been credited as apology.' },
  MISSING_ITEMS: { title: 'Item Unavailable', template: '{count} item(s) in your order #{orderNumber} were unavailable. ₹{amount} has been refunded to your wallet.' },
};

function fillTemplate(template, data) {
  return template.replace(/\{(\w+)\}/g, (_, key) => data[key] || '');
}

const ORDER_CHANNEL_TYPES = new Set([
  'ORDER_PLACED', 'ORDER_AWAITING_PAYMENT', 'COD_ORDER_PLACED', 'WALLET_ORDER_PLACED',
  'ORDER_CONFIRMED', 'ORDER_PACKED', 'ORDER_ON_WAY',
  'ORDER_ARRIVED', 'ORDER_DELIVERED', 'ORDER_CANCELLED', 'ORDER_CANCELLED_BY_STORE',
  'DELIVERY_DELAYED', 'DELIVERY_SLA_BREACH', 'MISSING_ITEMS',
]);
const PAYMENT_CHANNEL_TYPES = new Set([
  'PAYMENT_FAILED', 'PAYMENT_CANCELLED', 'PAYMENT_TIMEOUT', 'PAYMENT_PENDING',
  'PAYMENT_RETRY_AVAILABLE', 'WALLET_PAYMENT_FAILED',
  'REFUND_INITIATED', 'REFUND_APPROVED', 'REFUND_COMPLETED', 'REFUND_REJECTED', 'WALLET_CREDIT',
]);

function resolveChannelId(type) {
  if (ORDER_CHANNEL_TYPES.has(type)) return 'orders';
  if (PAYMENT_CHANNEL_TYPES.has(type)) return 'payments';
  return 'default';
}

async function deliverToExpo(tokens, title, body, data) {
  const channelId = resolveChannelId(data?.type);
  const messages = tokens.map((t) => ({
    to: t,
    sound: 'default',
    title,
    body,
    data,
    channelId,
    priority: 'high',
  }));

  const CHUNK_SIZE = 100;
  const results = [];

  for (let i = 0; i < messages.length; i += CHUNK_SIZE) {
    const chunk = messages.slice(i, i + CHUNK_SIZE);
    try {
      const headers = {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      };
      if (process.env.EXPO_ACCESS_TOKEN) {
        headers['Authorization'] = `Bearer ${process.env.EXPO_ACCESS_TOKEN}`;
      }

      const res = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers,
        body: JSON.stringify(chunk),
      });
      const result = await res.json();

      if (result.data) {
        const errors = result.data.filter((r) => r.status === 'error');
        if (errors.length > 0) {
          logger.warn('Expo push partial failures', {
            total: chunk.length,
            failed: errors.length,
            errors: errors.map((e) => ({ message: e.message, details: e.details?.error })),
          });
        }
      }

      results.push(result);
    } catch (err) {
      logger.error('Expo push delivery failed', { err: err.message, chunkSize: chunk.length });
    }
  }

  return results.length === 1 ? results[0] : results;
}

/**
 * Create the in-app notification + deliver the push.
 * @param {object} [options]
 * @param {string} [options.dedupeKey] — when set, the notification is created
 *   exactly once across all processes/handlers: a unique partial index on
 *   `dedupeKey` claims the event atomically, and losers skip both the DB row
 *   and the push delivery (no duplicate inbox entries, no duplicate pushes).
 */
async function sendPushNotification(customerId, type, data = {}, options = {}) {
  try {
    const config = NOTIFICATION_TYPES[type];
    if (!config) {
      logger.warn('Unknown notification type', { type });
      return;
    }

    const { CustomerUser } = require('../models/CustomerUser');
    const { isPushEnabled } = require('./notificationPreferencesService');
    const user = await CustomerUser.findById(customerId).select('notificationPreferences').lean();
    // Push preference only gates Expo delivery — the in-app Notification Center
    // must always receive payment/order outcomes (especially Payment Cancelled).
    const pushAllowed = isPushEnabled(user?.notificationPreferences);

    const title = config.title;
    const body = fillTemplate(config.template, data);

    const dedupeKey =
      typeof options.dedupeKey === 'string' && options.dedupeKey.trim() !== ''
        ? options.dedupeKey.trim()
        : null;

    if (dedupeKey) {
      // Atomic exactly-once claim: upsert on the unique dedupeKey. If a doc
      // already exists (another handler won the race), skip entirely.
      try {
        const existing = await Notification.findOneAndUpdate(
          { dedupeKey },
          {
            $setOnInsert: {
              userId: customerId,
              title,
              body,
              read: false,
              data: { type, ...data },
            },
          },
          { upsert: true, new: false }
        ).lean();
        if (existing) {
          logger.info('Notification deduplicated (already sent)', { customerId, type, dedupeKey });
          return { success: true, skipped: true, reason: 'duplicate', dedupeKey };
        }
      } catch (err) {
        // E11000 = concurrent upsert lost the unique-index race — same as duplicate.
        if (err && (err.code === 11000 || String(err.message || '').includes('E11000'))) {
          logger.info('Notification deduplicated (concurrent insert)', { customerId, type, dedupeKey });
          return { success: true, skipped: true, reason: 'duplicate', dedupeKey };
        }
        logger.warn('In-app notification save failed', { err: err.message });
        // Fail open for delivery: the push below still goes out once per error, never per duplicate.
      }
    } else {
      // Persist in-app notification
      await Notification.create({
        userId: customerId,
        title,
        body,
        data: { type, ...data },
      }).catch(err => logger.warn('In-app notification save failed', { err: err.message }));
    }

    await NotificationHistory.create({
      userId: String(customerId),
      templateName: type,
      channel: 'push',
      title,
      body,
      status: 'sent',
      sentAt: new Date(),
      ...(pushAllowed ? {} : { failureReason: 'push_preferences_disabled' }),
    }).catch(err => logger.warn('NotificationHistory save failed', { err: err.message }));

    if (!pushAllowed) {
      logger.info('Expo push skipped by user preferences (in-app notification saved)', {
        customerId,
        type,
      });
      return { success: true, title, body, pushSkipped: true, reason: 'preferences' };
    }

    // Deliver real push via Expo
    const tokenDocs = await PushToken.find({ userId: customerId, active: true }).lean();
    const pushTokens = tokenDocs.map((d) => d.token);
    if (pushTokens.length > 0) {
      const result = await deliverToExpo(pushTokens, title, body, { type, ...data });
      logger.info('Push notification delivered', { customerId, type, title, deviceCount: pushTokens.length, result: JSON.stringify(result).slice(0, 200) });
    } else {
      logger.warn('No active push tokens found for user', { customerId, type });
    }

    return { success: true, title, body };
  } catch (err) {
    logger.error('sendPushNotification error', { err: err.message, customerId, type });
    return { success: false, error: err.message };
  }
}

function orderNotificationData(order, extra = {}) {
  return {
    orderNumber: order.orderNumber,
    orderId: String(order._id),
    eta: order.estimatedDelivery ? new Date(order.estimatedDelivery).toLocaleTimeString() : '',
    otp: order.deliveryOtp || '',
    reason: order.cancellationReason || '',
    ...extra,
  };
}

/** Actors whose cancellations should read "cancelled by the store" to the customer. */
const STORE_CANCEL_ACTORS = new Set(['admin', 'darkstore', 'store', 'warehouse', 'finance']);

/**
 * Notification types that must never exist for a cancelled order.
 * A cancelled order shows ONLY "Order Cancelled" — never placement/confirmation wording.
 */
const PLACEMENT_NOTIFICATION_TYPES = [
  'ORDER_PLACED',
  'COD_ORDER_PLACED',
  'WALLET_ORDER_PLACED',
  'ORDER_AWAITING_PAYMENT',
  'ORDER_CONFIRMED',
];

/** Fresh status read — the caller's `order` doc may be stale in racy payment/cancel flows. */
async function isOrderCancelled(orderId) {
  try {
    const { Order } = require('../models/Order');
    const fresh = await Order.findById(orderId).select('status').lean();
    return fresh?.status === 'cancelled';
  } catch (err) {
    logger.warn('isOrderCancelled check failed', { orderId: String(orderId), err: err.message });
    return false;
  }
}

/**
 * Purge stale placement/confirmation in-app notifications for an order.
 * Called on cancellation so the inbox shows ONLY "Order Cancelled".
 */
async function removeOrderPlacementNotifications(userId, orderId) {
  try {
    const result = await Notification.deleteMany({
      userId,
      'data.orderId': String(orderId),
      'data.type': { $in: PLACEMENT_NOTIFICATION_TYPES },
    });
    if (result.deletedCount > 0) {
      logger.info('Removed placement notifications for cancelled order', {
        orderId: String(orderId),
        deletedCount: result.deletedCount,
      });
    }
    return result.deletedCount || 0;
  } catch (err) {
    logger.warn('removeOrderPlacementNotifications failed', {
      orderId: String(orderId),
      err: err.message,
    });
    return 0;
  }
}

/**
 * Placement notification driven by ACTUAL payment state on the order (never assume payment).
 * - COD                → COD_ORDER_PLACED
 * - wallet             → WALLET_ORDER_PLACED
 * - online, paid       → ORDER_PLACED
 * - online, unpaid     → NO notification. The customer is still inside checkout;
 *   the verified payment outcome (success/failed/cancelled/pending/timeout)
 *   sends the one correct notification instead.
 */
async function sendOrderPlacementNotification(order) {
  if (!order) return;
  // A cancelled order must never receive placement wording — covers the race
  // where the async ORDER_CREATED listener fires after an immediate cancel.
  if (order.status === 'cancelled' || (await isOrderCancelled(order._id))) {
    logger.info('Placement notification suppressed: order cancelled', { orderId: String(order._id) });
    return;
  }
  const methodType = order.paymentMethod?.methodType;
  let type;
  if (methodType === 'cash') {
    type = 'COD_ORDER_PLACED';
  } else if (methodType === 'wallet') {
    type = 'WALLET_ORDER_PLACED';
  } else if (order.paymentStatus === 'paid') {
    type = 'ORDER_PLACED';
  } else {
    // Online payment not verified yet — never notify at creation time.
    // The verified gateway outcome will notify success/failed/cancelled instead.
    return;
  }
  await sendPushNotification(order.userId, type, orderNotificationData(order));
}

/** Gateway prepayment methods — the only orders that may receive payment-outcome notifications. */
const GATEWAY_METHOD_TYPES = new Set(['card', 'upi', 'digital']);

/**
 * Payment outcome notifications, sent only after the backend has verified the
 * gateway result (hash + amount) and updated the payment/order records.
 * Hard rule: COD and wallet orders never receive payment session/outcome
 * notifications — they have no gateway payment session at all.
 * @param {'success'|'failed'|'cancelled'|'timeout'|'pending'} outcome
 */
async function sendPaymentOutcomeNotification(order, outcome, extra = {}) {
  if (!order) return;
  const methodType = String(order.paymentMethod?.methodType || '').toLowerCase();
  if (!GATEWAY_METHOD_TYPES.has(methodType)) {
    logger.warn('Payment outcome notification suppressed: order is not an online payment', {
      orderId: String(order._id),
      methodType,
      outcome,
    });
    return;
  }
  const typeMap = {
    success: 'ORDER_PLACED',
    failed: 'PAYMENT_FAILED',
    cancelled: 'PAYMENT_CANCELLED',
    timeout: 'PAYMENT_TIMEOUT',
    pending: 'PAYMENT_PENDING',
  };
  const type = typeMap[outcome];
  if (!type) return;
  // "success" maps to ORDER_PLACED — never send it once the order is cancelled
  // (late gateway webhook/return/reconcile racing a customer cancel).
  if (outcome === 'success' && (order.status === 'cancelled' || (await isOrderCancelled(order._id)))) {
    logger.info('Payment success notification suppressed: order cancelled', { orderId: String(order._id) });
    return;
  }
  // When a failure outcome accompanies a cancelled order, clear stale placement entries.
  if (['failed', 'cancelled', 'timeout'].includes(outcome) && order.status === 'cancelled') {
    await removeOrderPlacementNotifications(order.userId, order._id);
  }
  // Terminal outcomes happen at most once per order (the order is either
  // placed or voided exactly once), so key them on orderId + event type.
  // This makes payment-outcome notifications idempotent even if callback,
  // webhook, polling reconcile, and retry paths all report the same result.
  const isTerminalOutcome = ['success', 'failed', 'cancelled', 'timeout'].includes(outcome);
  const options = isTerminalOutcome
    ? { dedupeKey: `payment-outcome:${String(order._id)}:${type}` }
    : {};
  await sendPushNotification(order.userId, type, orderNotificationData(order, extra), options);
}

async function sendOrderStatusNotification(order, newStatus, { actor } = {}) {
  const typeMap = {
    confirmed: 'ORDER_CONFIRMED',
    'getting-packed': 'ORDER_PACKED',
    'on-the-way': 'ORDER_ON_WAY',
    arrived: 'ORDER_ARRIVED',
    delivered: 'ORDER_DELIVERED',
    cancelled: 'ORDER_CANCELLED',
  };

  // "pending" means the order was just created — placement wording depends on
  // the real payment state, never a blanket "Order Placed".
  if (newStatus === 'pending') {
    await sendOrderPlacementNotification(order);
    return;
  }

  let type = typeMap[newStatus];
  if (!type) return;

  if (type === 'ORDER_CANCELLED' && STORE_CANCEL_ACTORS.has(String(actor || '').toLowerCase())) {
    type = 'ORDER_CANCELLED_BY_STORE';
  }

  // Cancellation (customer/admin/system): the inbox must show ONLY "Order Cancelled" —
  // purge any placement/confirmation notifications already written for this order.
  if (newStatus === 'cancelled') {
    await removeOrderPlacementNotifications(order.userId, order._id);
  }

  await sendPushNotification(order.userId, type, orderNotificationData(order));
}

async function sendRefundNotification(customerId, type, data) {
  await sendPushNotification(customerId, type, data);
}

module.exports = {
  sendPushNotification,
  sendOrderStatusNotification,
  sendOrderPlacementNotification,
  sendPaymentOutcomeNotification,
  sendRefundNotification,
  removeOrderPlacementNotifications,
  deliverToExpo,
  fillTemplate,
  NOTIFICATION_TYPES,
  PLACEMENT_NOTIFICATION_TYPES,
};
