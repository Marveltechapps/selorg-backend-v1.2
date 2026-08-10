/**
 * Preference-gated SMS / WhatsApp / Email delivery for customer notifications.
 *
 * OTP / login channels are intentionally separate (authController + otp providers)
 * and must NEVER consult notificationPreferences.
 *
 * Optional test overrides (do not use mailto: — pass a real address):
 *   CUSTOMER_NOTIF_SMS_TO=9444183378
 *   CUSTOMER_NOTIF_WHATSAPP_TO=9444183378
 *   CUSTOMER_NOTIF_EMAIL_TO=admin@selorg.com
 */
const NotificationHistory = require('../../admin/models/NotificationHistory');
const logger = require('../../core/utils/logger');
const {
  isSmsEnabled,
  isWhatsAppEnabled,
  isEmailEnabled,
} = require('./notificationPreferencesService');

const RETRY_ATTEMPTS = 2;
const RETRY_BASE_MS = 400;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTransientFailure(result) {
  const msg = String(result?.userMessage || result?.internalError || result?.internalLog || result?.error || '').toLowerCase();
  return /timeout|timed out|econnreset|econnrefused|network|temporar|429|502|503|504/.test(msg);
}

async function withRetry(fn, { label, retries = RETRY_ATTEMPTS } = {}) {
  let last = { sent: false };
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const result = await fn();
      last = result || { sent: false };
      if (last.sent) return last;
      if (last.configured === false) return last;
      if (!isTransientFailure(last) && attempt > 0) return last;
      if (!isTransientFailure(last) && attempt === 0 && last.errorCode) return last;
    } catch (err) {
      last = { sent: false, error: err?.message || String(err) };
      if (!isTransientFailure(last) && attempt === retries) break;
    }
    if (attempt < retries) {
      const delay = RETRY_BASE_MS * (attempt + 1);
      logger.warn(`${label} retry scheduled`, { attempt: attempt + 1, delayMs: delay });
      await sleep(delay);
    }
  }
  return last;
}

function digits10(phone) {
  const d = String(phone || '').replace(/\D/g, '');
  return d.length >= 10 ? d.slice(-10) : '';
}

function isPlaceholderEmail(email) {
  const value = String(email || '').trim().toLowerCase();
  if (!value) return true;
  if (value.includes('no-email') || value.endsWith('@no-email.selorg')) return true;
  return !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

/**
 * Test-only destination overrides (CUSTOMER_NOTIF_*_TO).
 * Disabled in production unless ALLOW_CUSTOMER_NOTIF_OVERRIDES=true so a leftover
 * staging override cannot silently redirect real customer SMS/WhatsApp/email.
 */
function customerNotifOverridesAllowed() {
  if (String(process.env.ALLOW_CUSTOMER_NOTIF_OVERRIDES || '').toLowerCase() === 'true') {
    return true;
  }
  return String(process.env.NODE_ENV || '').toLowerCase() !== 'production';
}

function readEmailOverride() {
  if (!customerNotifOverridesAllowed()) return '';
  return String(process.env.CUSTOMER_NOTIF_EMAIL_TO || '')
    .trim()
    .replace(/^mailto:/i, '');
}

/**
 * Resolve SMS destination: env override for testing, else user's phone.
 */
function resolveSmsTo(userPhone) {
  if (customerNotifOverridesAllowed()) {
    const override = String(process.env.CUSTOMER_NOTIF_SMS_TO || '').replace(/\D/g, '').slice(-10);
    if (override.length === 10) {
      logger.warn('SMS destination overridden by CUSTOMER_NOTIF_SMS_TO (non-production/test)');
      return override;
    }
  }
  return digits10(userPhone);
}

function resolveWhatsAppTo(userPhone) {
  if (customerNotifOverridesAllowed()) {
    const override = String(process.env.CUSTOMER_NOTIF_WHATSAPP_TO || '').replace(/\D/g, '').slice(-10);
    if (override.length === 10) {
      logger.warn('WhatsApp destination overridden by CUSTOMER_NOTIF_WHATSAPP_TO (non-production/test)');
      return override;
    }
  }
  return digits10(userPhone);
}

function resolveEmailTo(userEmail, savedCheckoutEmail) {
  const override = readEmailOverride();
  if (override && !isPlaceholderEmail(override)) {
    logger.warn('Email destination overridden by CUSTOMER_NOTIF_EMAIL_TO (non-production/test)');
    return override;
  }
  if (!isPlaceholderEmail(userEmail)) return String(userEmail).trim();
  if (!isPlaceholderEmail(savedCheckoutEmail)) return String(savedCheckoutEmail).trim();
  return '';
}

function formatChannelBody(title, body) {
  const t = String(title || '').trim();
  const b = String(body || '').trim();
  if (t && b) return `Selorg: ${t} — ${b}`.slice(0, 1400);
  return `Selorg: ${t || b}`.slice(0, 1400);
}

async function recordChannelHistory({
  customerId,
  type,
  title,
  body,
  channel,
  result,
}) {
  const sent = !!result?.sent;
  await NotificationHistory.create({
    userId: String(customerId),
    templateName: type,
    channel,
    title,
    body,
    status: sent ? 'sent' : 'failed',
    sentAt: new Date(),
    ...(sent
      ? {}
      : {
          failureReason: String(
            result?.userMessage ||
              result?.internalError ||
              result?.internalLog ||
              result?.error ||
              'delivery_failed'
          ).slice(0, 500),
        }),
  }).catch((err) => logger.warn('NotificationHistory channel save failed', { channel, err: err.message }));
}

async function deliverSms({ customerId, phone, type, title, body }) {
  const to = resolveSmsTo(phone);
  if (!to) {
    const result = { sent: false, skipped: true, reason: 'no_phone' };
    logger.info('SMS notification skipped — no phone', { customerId, type });
    await recordChannelHistory({ customerId, type, title, body, channel: 'sms', result });
    return result;
  }

  const { sendPickerTransactionalSms } = require('../../picker/services/sms.service');
  const text = formatChannelBody(title, body);
  const result = await withRetry(() => sendPickerTransactionalSms(to, text), { label: 'SMS' });

  if (result.sent) {
    logger.info('SMS notification delivered', { customerId, type, to, provider: result.provider });
  } else {
    logger.warn('SMS notification failed', {
      customerId,
      type,
      to,
      reason: result.userMessage || result.internalLog || result.error,
    });
  }
  await recordChannelHistory({ customerId, type, title, body, channel: 'sms', result });
  return { ...result, to };
}

async function deliverWhatsApp({ customerId, phone, type, title, body }) {
  const to = resolveWhatsAppTo(phone);
  if (!to) {
    const result = { sent: false, skipped: true, reason: 'no_phone' };
    logger.info('WhatsApp notification skipped — no phone', { customerId, type });
    await recordChannelHistory({ customerId, type, title, body, channel: 'whatsapp', result });
    return result;
  }

  const { sendTransactionalWhatsApp } = require('../../picker/services/sms.service');
  const text = formatChannelBody(title, body);
  const result = await withRetry(() => sendTransactionalWhatsApp(to, text), { label: 'WhatsApp' });

  if (result.sent) {
    logger.info('WhatsApp notification delivered', { customerId, type, to, provider: result.provider });
  } else {
    logger.warn('WhatsApp notification failed', {
      customerId,
      type,
      to,
      reason: result.userMessage || result.internalLog || result.error,
    });
  }
  await recordChannelHistory({ customerId, type, title, body, channel: 'whatsapp', result });
  return { ...result, to };
}

async function deliverEmail({ customerId, email, checkoutEmail, type, title, body }) {
  const to = resolveEmailTo(email, checkoutEmail);
  if (!to) {
    const result = { sent: false, skipped: true, reason: 'no_email' };
    logger.info('Email notification skipped — no email', { customerId, type });
    await recordChannelHistory({ customerId, type, title, body, channel: 'email', result });
    return result;
  }

  const { sendTransactionalEmail } = require('../../picker/services/emailOtp.service');
  // Prefer Resend-verified customer From when present; unverified domains cause
  // Resend to reject and fall back. Let emailOtp.service resolve brand From.
  const customerFrom =
    process.env.CUSTOMER_RESEND_VERIFIED_FROM ||
    process.env.CUSTOMER_RESEND_FROM ||
    process.env.CUSTOMER_EMAIL_FROM ||
    undefined;
  const result = await withRetry(
    () =>
      sendTransactionalEmail({
        to,
        subject: String(title || 'Selorg notification'),
        text: String(body || ''),
        appName: process.env.CUSTOMER_APP_NAME || 'Selorg',
        from: customerFrom,
      }),
    { label: 'Email' }
  );

  if (result.sent) {
    logger.info('Email notification delivered', {
      customerId,
      type,
      to,
      provider: result.provider,
    });
  } else {
    logger.warn('Email notification failed', {
      customerId,
      type,
      to,
      reason: result.userMessage || result.internalError || result.error,
    });
  }
  await recordChannelHistory({ customerId, type, title, body, channel: 'email', result });
  return { ...result, to };
}

/**
 * Fan-out SMS / WhatsApp / Email based on saved preferences.
 * Safe to call in parallel with Expo push; never throws.
 */
async function deliverPreferenceChannels({
  customerId,
  user,
  preferences,
  type,
  title,
  body,
}) {
  const prefs = preferences || user?.notificationPreferences;
  const tasks = [];
  const channels = { sms: null, whatsapp: null, email: null };

  if (isSmsEnabled(prefs)) {
    tasks.push(
      deliverSms({
        customerId,
        phone: user?.phoneNumber,
        type,
        title,
        body,
      }).then((r) => {
        channels.sms = r;
      })
    );
  } else {
    logger.info('SMS notification skipped by user preferences', { customerId, type });
  }

  if (isWhatsAppEnabled(prefs)) {
    tasks.push(
      deliverWhatsApp({
        customerId,
        phone: user?.phoneNumber,
        type,
        title,
        body,
      }).then((r) => {
        channels.whatsapp = r;
      })
    );
  } else {
    logger.info('WhatsApp notification skipped by user preferences', { customerId, type });
  }

  if (isEmailEnabled(prefs)) {
    tasks.push(
      deliverEmail({
        customerId,
        email: user?.email,
        checkoutEmail: user?.savedCheckoutContact?.email,
        type,
        title,
        body,
      }).then((r) => {
        channels.email = r;
      })
    );
  } else {
    logger.info('Email notification skipped by user preferences', { customerId, type });
  }

  if (tasks.length > 0) {
    await Promise.allSettled(tasks);
  }

  return channels;
}

module.exports = {
  deliverPreferenceChannels,
  resolveSmsTo,
  resolveWhatsAppTo,
  resolveEmailTo,
  formatChannelBody,
  customerNotifOverridesAllowed,
};
