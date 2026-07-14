/**
 * Lightweight validators for customer Help & Support payloads.
 */
const VALID_TICKET_CATEGORIES = new Set([
  'order',
  'payment',
  'delivery',
  'account',
  'technical',
  'feedback',
]);

function asString(value, maxLen = 5000) {
  return String(value ?? '')
    .replace(/<[^>]*>/g, '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .trim()
    .slice(0, maxLen);
}

function validateCreateTicketBody(body = {}) {
  const errors = [];
  const subject = asString(body.subject, 200);
  const description = asString(body.description || body.message, 5000);
  const liveChat =
    body.channel === 'chat' ||
    body.liveChat === true ||
    body.liveChat === 'true' ||
    body.type === 'general_inquiry' ||
    body.type === 'order_issue';

  if (!liveChat && !subject && !description) {
    errors.push('Subject or description is required');
  }
  if (body.priority && !['low', 'medium', 'high', 'urgent'].includes(String(body.priority))) {
    errors.push('Invalid priority');
  }
  if (body.category) {
    const cat = String(body.category).trim().toLowerCase();
    // Free-form UI keys are normalized later; reject only obviously empty values.
    if (!cat) errors.push('Invalid category');
  }

  return {
    ok: errors.length === 0,
    errors,
    data: {
      subject,
      description,
      category: asString(body.category, 40),
      priority: asString(body.priority, 20) || 'medium',
      orderNumber: asString(body.orderNumber || body.orderId, 80),
      channel: asString(body.channel, 40) || 'in_app',
    },
  };
}

function validateMessageBody(body = {}) {
  const message = asString(body.message || body.text || body.content, 5000);
  return {
    ok: Boolean(message),
    errors: message ? [] : ['Message content is required'],
    data: { message },
  };
}

function parseHelpful(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const v = value.trim().toLowerCase();
    if (v === 'true' || v === '1' || v === 'yes') return true;
    if (v === 'false' || v === '0' || v === 'no') return false;
  }
  return null;
}

module.exports = {
  VALID_TICKET_CATEGORIES,
  asString,
  validateCreateTicketBody,
  validateMessageBody,
  parseHelpful,
};
