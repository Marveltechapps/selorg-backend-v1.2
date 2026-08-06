const { Notification } = require('../models/Notification');
const logger = require('../../core/utils/logger');

const NOTIFICATION_TYPES = {
  // Order placement — sent only after payment is actually confirmed (or COD/wallet confirmed).
  ORDER_PLACED: { title: 'Order Placed', template: 'Order placed successfully.' },
  ORDER_AWAITING_PAYMENT: { title: 'Awaiting Payment', template: 'Your order #{orderNumber} has been created and is awaiting payment.' },
  COD_ORDER_PLACED: { title: 'Order Placed', template: 'Order placed successfully.' },
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
  PAYMENT_SUCCESS: { title: 'Payment Successful', template: 'Payment successful for order #{orderNumber}.' },
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
  WALLET_CREDIT: { title: 'Wallet Update', template: '₹{amount} has been added to your wallet. New balance: ₹{balance}' },
  WALLET_DEBIT: { title: 'Wallet Update', template: '₹{amount} has been deducted from your wallet. New balance: ₹{balance}' },
  SUPPORT_REPLY: { title: 'Support Update', template: 'Support replied to your ticket #{ticketId}' },
  DELIVERY_DELAYED: { title: 'Delivery Delayed', template: 'Your order #{orderNumber} is delayed. New ETA: {eta}. We apologize!' },
  DELIVERY_SLA_BREACH: { title: 'SLA Breach - Compensation Issued', template: 'Your order #{orderNumber} was delayed by {delayMins} mins. ₹{compensation} has been credited as apology.' },
  MISSING_ITEMS: { title: 'Item Unavailable', template: '{count} item(s) in your order #{orderNumber} were unavailable. ₹{amount} has been refunded to your wallet.' },
  WELCOME: { title: 'Welcome to Selorg', template: 'Hi {name}! Welcome to Selorg. Fresh groceries, delivered fast.' },
  SYSTEM_ANNOUNCEMENT: { title: 'System Notification', template: '{message}' },
  NEW_OFFER: { title: 'New Offer', template: '{message}' },
  OFFER_CAMPAIGN: { title: 'New Offer', template: '{message}' },
  PROMOTIONAL_CAMPAIGN: { title: 'Promotional Campaign', template: '{message}' },
  CAMPAIGN: { title: 'Promotional Campaign', template: '{message}' },
};

function fillTemplate(template, data) {
  return template.replace(/\{(\w+)\}/g, (_, key) => data[key] || '');
}

/** @deprecated Prefer unifiedNotificationService.deliverToExpo — kept for callers. */
async function deliverToExpo(tokens, title, body, data) {
  const { deliverToExpo: unified } = require('./unifiedNotificationService');
  return unified(tokens, title, body, data);
}

/**
 * Transactional send — routes through the unified notification pipeline
 * (preferences, category matrix, DND, Expo + Web Push, SMS/WA/Email, history, dedupe).
 *
 * @param {object} [options]
 * @param {string} [options.dedupeKey]
 * @param {string[]} [options.channels]
 * @param {string} [options.category]
 */
async function sendPushNotification(customerId, type, data = {}, options = {}) {
  try {
    const config = NOTIFICATION_TYPES[type];
    if (!config) {
      logger.warn('Unknown notification type', { type });
      return { success: false, error: 'unknown_type' };
    }

    const title = config.title;
    const body = fillTemplate(config.template, data);
    const { sendNotification } = require('./unifiedNotificationService');
    const { resolveCategory } = require('../constants/notificationCategories');

    return await sendNotification({
      userId: customerId,
      title,
      body,
      type,
      category: options.category || resolveCategory(type),
      data,
      dedupeKey: options.dedupeKey || null,
      channels: options.channels,
    });
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
/** Shared exactly-once key for all "order placed" variants (COD / wallet / online). */
function orderPlacedDedupeKey(orderId) {
  return `order-placed:${String(orderId)}`;
}

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
  await sendPushNotification(order.userId, type, orderNotificationData(order), {
    dedupeKey: orderPlacedDedupeKey(order._id),
  });
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
  // Success shares the placement dedupe key so ORDER_CREATED / fulfillment
  // release / payment callback never produce two "Order Placed" rows.
  let options = {};
  if (outcome === 'success') {
    options = { dedupeKey: orderPlacedDedupeKey(order._id) };
  } else if (['failed', 'cancelled', 'timeout'].includes(outcome)) {
    options = { dedupeKey: `payment-outcome:${String(order._id)}:${type}` };
  }
  await sendPushNotification(order.userId, type, orderNotificationData(order, extra), options);
  try {
    const { fireForPayment } = require('./automationRuntimeService');
    await fireForPayment(order, outcome);
  } catch (_) {
    /* automation is best-effort */
  }
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

  // Store "confirmed" is an internal fulfillment step that usually follows
  // immediately after placement. Customers already received "Order Placed" —
  // a second "Order Confirmed" push/inbox entry is a duplicate.
  if (newStatus === 'confirmed') {
    logger.info('ORDER_CONFIRMED notification suppressed (covered by placement)', {
      orderId: String(order._id),
    });
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
  try {
    const { fireForOrderStatus } = require('./automationRuntimeService');
    await fireForOrderStatus(order, newStatus);
  } catch (_) {
    /* automation is best-effort */
  }
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
