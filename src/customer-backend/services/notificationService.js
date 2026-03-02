const { NotificationHistory } = require('../../admin/models/NotificationHistory');
const { PushToken } = require('../models/PushToken');
const { Notification } = require('../models/Notification');
const logger = require('../../core/utils/logger');

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

const NOTIFICATION_TYPES = {
  ORDER_PLACED: { title: 'Order Placed!', template: 'Your order #{orderNumber} has been placed successfully. We\'ll notify you when it\'s confirmed.' },
  ORDER_CONFIRMED: { title: 'Order Confirmed', template: 'Your order #{orderNumber} has been confirmed' },
  ORDER_PACKED: { title: 'Order Packed', template: 'Your order #{orderNumber} is packed and ready for pickup' },
  ORDER_ON_WAY: { title: 'Out for Delivery', template: 'Your order #{orderNumber} is on its way! ETA: {eta}' },
  ORDER_ARRIVED: { title: 'Rider Arrived', template: 'Your rider has arrived with order #{orderNumber}. OTP: {otp}' },
  ORDER_DELIVERED: { title: 'Order Delivered', template: 'Your order #{orderNumber} has been delivered. Rate your experience!' },
  ORDER_CANCELLED: { title: 'Order Cancelled', template: 'Your order #{orderNumber} has been cancelled. {reason}' },
  REFUND_APPROVED: { title: 'Refund Approved', template: 'Your refund of ₹{amount} for order #{orderNumber} has been approved' },
  REFUND_COMPLETED: { title: 'Refund Completed', template: '₹{amount} has been credited to your {method}' },
  REFUND_REJECTED: { title: 'Refund Update', template: 'Your refund request for order #{orderNumber} could not be processed. {reason}' },
  WALLET_CREDIT: { title: 'Wallet Credited', template: '₹{amount} has been added to your wallet. New balance: ₹{balance}' },
  SUPPORT_REPLY: { title: 'Support Update', template: 'Support replied to your ticket #{ticketId}' },
  DELIVERY_DELAYED: { title: 'Delivery Delayed', template: 'Your order #{orderNumber} is delayed. New ETA: {eta}. We apologize!' },
  MISSING_ITEMS: { title: 'Item Unavailable', template: '{count} item(s) in your order #{orderNumber} were unavailable. ₹{amount} has been refunded to your wallet.' },
};

function fillTemplate(template, data) {
  return template.replace(/\{(\w+)\}/g, (_, key) => data[key] || '');
}

async function deliverToExpo(tokens, title, body, data) {
  const messages = tokens.map((t) => ({
    to: t,
    sound: 'default',
    title,
    body,
    data,
    channelId: 'default',
  }));

  try {
    const res = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(messages),
    });
    const result = await res.json();
    return result;
  } catch (err) {
    logger.error('Expo push delivery failed', { err: err.message });
    return null;
  }
}

async function sendPushNotification(customerId, type, data = {}) {
  try {
    const config = NOTIFICATION_TYPES[type];
    if (!config) {
      logger.warn('Unknown notification type', { type });
      return;
    }

    const title = config.title;
    const body = fillTemplate(config.template, data);

    // Persist in-app notification
    await Notification.create({
      userId: customerId,
      title,
      body,
      data: { type, ...data },
    }).catch(err => logger.warn('In-app notification save failed', { err: err.message }));

    await NotificationHistory.create({
      recipientId: customerId,
      recipientType: 'customer',
      channel: 'push',
      templateId: type,
      title,
      body,
      data: { type, ...data },
      status: 'sent',
      sentAt: new Date(),
    }).catch(err => logger.warn('NotificationHistory save failed', { err: err.message }));

    // Deliver real push via Expo
    const tokenDocs = await PushToken.find({ userId: customerId, active: true }).lean();
    const pushTokens = tokenDocs.map((d) => d.token);
    if (pushTokens.length > 0) {
      await deliverToExpo(pushTokens, title, body, { type, ...data });
    }

    logger.info('Push notification sent', { customerId, type, title, deviceCount: pushTokens.length });

    return { success: true, title, body };
  } catch (err) {
    logger.error('sendPushNotification error', { err: err.message, customerId, type });
    return { success: false, error: err.message };
  }
}

async function sendOrderStatusNotification(order, newStatus) {
  const typeMap = {
    pending: 'ORDER_PLACED',
    confirmed: 'ORDER_CONFIRMED',
    'getting-packed': 'ORDER_PACKED',
    'on-the-way': 'ORDER_ON_WAY',
    arrived: 'ORDER_ARRIVED',
    delivered: 'ORDER_DELIVERED',
    cancelled: 'ORDER_CANCELLED',
  };

  const type = typeMap[newStatus];
  if (!type) return;

  await sendPushNotification(order.userId, type, {
    orderNumber: order.orderNumber,
    orderId: String(order._id),
    eta: order.estimatedDelivery ? new Date(order.estimatedDelivery).toLocaleTimeString() : '',
    otp: order.deliveryOtp || '',
    reason: order.cancellationReason || '',
  });
}

async function sendRefundNotification(customerId, type, data) {
  await sendPushNotification(customerId, type, data);
}

module.exports = {
  sendPushNotification,
  sendOrderStatusNotification,
  sendRefundNotification,
  NOTIFICATION_TYPES,
};
