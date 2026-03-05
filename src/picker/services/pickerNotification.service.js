/**
 * Picker Notification Service
 * Sends push notifications to pickers (e.g. order assignment).
 */
const PushToken = require('../models/pushToken.model');
const logger = require('../../core/utils/logger');

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

async function getTokensForPicker(pickerId) {
  const pickerIdStr = String(pickerId);
  const docs = await PushToken.find({ userId: pickerIdStr }).lean();
  return docs.map((d) => d.token).filter(Boolean);
}

async function deliverToExpo(tokens, title, body, data = {}) {
  if (!tokens || tokens.length === 0) return;
  const messages = tokens.map((t) => ({
    to: t,
    sound: 'default',
    title,
    body,
    data,
    priority: 'high',
  }));
  try {
    const headers = { 'Content-Type': 'application/json', Accept: 'application/json' };
    if (process.env.EXPO_ACCESS_TOKEN) {
      headers['Authorization'] = `Bearer ${process.env.EXPO_ACCESS_TOKEN}`;
    }
    const res = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify(messages),
    });
    const result = await res.json();
    if (result.data) {
      const errors = result.data.filter((r) => r.status === 'error');
      if (errors.length > 0) {
        logger.warn('Picker push partial failures', { total: messages.length, failed: errors.length });
      }
    }
  } catch (err) {
    logger.error('Picker push delivery failed', { err: err.message });
  }
}

/**
 * Send order assignment push notification to picker
 * @param {string} pickerId - Picker user ID
 * @param {string} orderId - Order ID
 * @param {object} [details] - { orderItemCount?, storeId? }
 */
async function sendOrderAssignedPush(pickerId, orderId, details = {}) {
  const tokens = await getTokensForPicker(pickerId);
  if (tokens.length === 0) return;
  const itemCount = details.orderItemCount ?? details.item_count ?? '';
  const title = 'New Order Assigned';
  const body = itemCount ? `Order ${orderId} (${itemCount} items) has been assigned to you.` : `Order ${orderId} has been assigned to you.`;
  await deliverToExpo(tokens, title, body, {
    type: 'ORDER_ASSIGNED',
    orderId,
    ...details,
  });
}

module.exports = { sendOrderAssignedPush, getTokensForPicker };
