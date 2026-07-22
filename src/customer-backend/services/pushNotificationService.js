const { PushToken } = require('../models/PushToken');

// DEPRECATED: prefer notificationService.sendOrderStatusNotification (payment-state-aware).
// Kept aligned with the canonical templates so any legacy caller shows correct copy.
const ORDER_STATUS_MESSAGES = {
  confirmed: { title: 'Order Confirmed', body: 'Your order has been confirmed.' },
  'getting-packed': { title: 'Order Packed', body: 'Your order has been packed.' },
  'on-the-way': { title: 'Out for Delivery', body: 'Your order is out for delivery.' },
  arrived: { title: 'Rider Arrived', body: 'Your delivery partner has reached your location.' },
  delivered: { title: 'Order Delivered', body: 'Your order has been delivered.' },
  cancelled: { title: 'Order Cancelled', body: 'Your order has been cancelled.' },
};

async function sendOrderStatusPush(userId, orderId, status, orderNumber) {
  const message = ORDER_STATUS_MESSAGES[status];
  if (!message) return;

  const tokens = await PushToken.find({ userId, active: true }).select('token').lean();
  if (tokens.length === 0) return;

  const pushMessages = tokens.map((t) => ({
    to: t.token,
    sound: 'default',
    title: message.title,
    body: message.body,
    data: { type: 'order_status', orderId, orderNumber, status },
  }));

  try {
    const response = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(pushMessages),
    });
    const result = await response.json();

    // Deactivate invalid tokens
    if (result.data) {
      for (let i = 0; i < result.data.length; i++) {
        if (result.data[i].status === 'error' && result.data[i].details?.error === 'DeviceNotRegistered') {
          await PushToken.updateOne({ token: tokens[i].token }, { active: false });
        }
      }
    }
  } catch (err) {
    console.error('[push] Failed to send push notification:', err.message);
  }
}

module.exports = { sendOrderStatusPush, ORDER_STATUS_MESSAGES };
