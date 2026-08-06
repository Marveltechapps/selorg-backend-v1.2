/**
 * Unit checks for preference-gated channel delivery helpers.
 * Run: node src/customer-backend/services/__tests__/channelDeliveryService.test.js
 */
const assert = require('assert');

// Load from the customer-backend services folder
const {
  resolveSmsTo,
  resolveWhatsAppTo,
  resolveEmailTo,
  formatChannelBody,
} = require('../channelDeliveryService');
const {
  isSmsEnabled,
  isWhatsAppEnabled,
  isEmailEnabled,
  isPushEnabled,
  normalizePreferences,
} = require('../notificationPreferencesService');

function withEnv(key, value, fn) {
  const prev = process.env[key];
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
  try {
    return fn();
  } finally {
    if (prev === undefined) delete process.env[key];
    else process.env[key] = prev;
  }
}

function testResolvers() {
  withEnv('CUSTOMER_NOTIF_SMS_TO', '9444183378', () => {
    assert.strictEqual(resolveSmsTo('9876543210'), '9444183378');
  });
  withEnv('CUSTOMER_NOTIF_SMS_TO', '', () => {
    assert.strictEqual(resolveSmsTo('+91 98765 43210'), '9876543210');
  });

  withEnv('CUSTOMER_NOTIF_WHATSAPP_TO', '9444183378', () => {
    assert.strictEqual(resolveWhatsAppTo('9000000000'), '9444183378');
  });

  withEnv('CUSTOMER_NOTIF_EMAIL_TO', 'admin@selorg.com', () => {
    assert.strictEqual(resolveEmailTo('user@example.com'), 'admin@selorg.com');
  });
  withEnv('CUSTOMER_NOTIF_EMAIL_TO', 'mailto:admin@selorg.com', () => {
    assert.strictEqual(resolveEmailTo('user@example.com'), 'admin@selorg.com');
  });
  withEnv('CUSTOMER_NOTIF_EMAIL_TO', '', () => {
    assert.strictEqual(resolveEmailTo('no-email-x@no-email.selorg', 'real@selorg.com'), 'real@selorg.com');
  });

  assert.ok(formatChannelBody('Order Placed', 'Thanks').includes('Order Placed'));
}

function testPreferenceGates() {
  assert.strictEqual(isSmsEnabled({ sms: false }), false);
  assert.strictEqual(isSmsEnabled({ sms: true }), true);
  assert.strictEqual(isWhatsAppEnabled({ whatsapp: false }), false);
  assert.strictEqual(isEmailEnabled({ email: false }), false);
  // OTP must stay independent: disabling sms prefs does not affect push helpers
  assert.strictEqual(isPushEnabled({ sms: false, push: true, dnd: false }), true);
  const normalized = normalizePreferences({ sms: false });
  assert.strictEqual(normalized.sms, false);
  assert.strictEqual(normalized.push, true);
}

testResolvers();
testPreferenceGates();
console.log('channelDeliveryService tests passed');
