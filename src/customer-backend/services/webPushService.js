/**
 * Browser Web Push (VAPID) delivery for Chrome / Edge.
 *
 * Env (backend only — never expose the private key to the frontend):
 *   WEB_PUSH_VAPID_PUBLIC_KEY
 *   WEB_PUSH_VAPID_PRIVATE_KEY
 *   WEB_PUSH_CONTACT_EMAIL  (mailto: identity for VAPID; no mailbox password required)
 */
const webpush = require('web-push');
const logger = require('../../core/utils/logger');

let configured = false;
let configureError = null;

/**
 * Normalize VAPID contact to a single mailto: URI.
 * Accepts "admin@selorg.com", "mailto:admin@selorg.com", or accidental "mailto:mailto:...".
 */
function normalizeVapidContact(raw) {
  const fallback = 'mailto:admin@selorg.com';
  let value = String(raw || '').trim();
  if (!value) return fallback;
  while (/^mailto:/i.test(value)) {
    value = value.replace(/^mailto:/i, '').trim();
  }
  if (!value || !value.includes('@')) return fallback;
  return `mailto:${value}`;
}

function ensureConfigured() {
  if (configured) return true;
  if (configureError) return false;

  const publicKey = String(process.env.WEB_PUSH_VAPID_PUBLIC_KEY || '').trim();
  const privateKey = String(process.env.WEB_PUSH_VAPID_PRIVATE_KEY || '').trim();
  if (!publicKey || !privateKey) {
    configureError = 'missing_vapid_keys';
    logger.warn('Web Push not configured — set WEB_PUSH_VAPID_PUBLIC_KEY and WEB_PUSH_VAPID_PRIVATE_KEY');
    return false;
  }

  const subject = normalizeVapidContact(process.env.WEB_PUSH_CONTACT_EMAIL);
  try {
    webpush.setVapidDetails(subject, publicKey, privateKey);
    configured = true;
    logger.info('Web Push VAPID configured', { subject });
    return true;
  } catch (err) {
    configureError = err.message;
    logger.error('Web Push VAPID configuration failed', { err: err.message });
    return false;
  }
}

function getPublicVapidKey() {
  const key = String(process.env.WEB_PUSH_VAPID_PUBLIC_KEY || '').trim();
  return key || null;
}

function isWebPushConfigured() {
  return Boolean(
    String(process.env.WEB_PUSH_VAPID_PUBLIC_KEY || '').trim() &&
      String(process.env.WEB_PUSH_VAPID_PRIVATE_KEY || '').trim()
  );
}

/**
 * @param {object} subscription — { endpoint, keys: { p256dh, auth } }
 * @param {{ title: string, body: string, data?: object, icon?: string, badge?: string }} payload
 */
async function sendWebPush(subscription, payload) {
  if (!ensureConfigured()) {
    return { sent: false, configured: false, error: configureError || 'web_push_not_configured' };
  }
  if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
    return { sent: false, error: 'invalid_subscription' };
  }

  const body = JSON.stringify({
    title: payload.title || 'Selorg',
    body: payload.body || '',
    data: payload.data || {},
    icon: payload.icon || '/icons/icon-192.png',
    badge: payload.badge || '/icons/badge-72.png',
  });

  try {
    await webpush.sendNotification(
      {
        endpoint: subscription.endpoint,
        keys: {
          p256dh: subscription.keys.p256dh,
          auth: subscription.keys.auth,
        },
      },
      body,
      { TTL: 60 * 60 * 12, urgency: 'high' }
    );
    return { sent: true };
  } catch (err) {
    const statusCode = err?.statusCode;
    logger.warn('Web Push delivery failed', {
      endpoint: String(subscription.endpoint).slice(0, 80),
      statusCode,
      err: err.message,
    });
    return {
      sent: false,
      error: err.message,
      statusCode,
      gone: statusCode === 404 || statusCode === 410,
    };
  }
}

/**
 * Deliver to multiple web subscriptions; deactivate gone endpoints.
 * @param {Array<{ _id, token, webSubscription }>} tokenDocs
 */
async function deliverToWebPush(tokenDocs, title, body, data) {
  const { PushToken } = require('../models/PushToken');
  const results = [];
  for (const doc of tokenDocs) {
    const sub =
      doc.webSubscription?.endpoint
        ? doc.webSubscription
        : doc.token
          ? { endpoint: doc.token, keys: doc.webSubscription?.keys }
          : null;
    if (!sub?.endpoint || !sub?.keys?.p256dh) {
      results.push({ sent: false, error: 'incomplete_subscription' });
      continue;
    }
    const result = await sendWebPush(sub, { title, body, data });
    results.push(result);
    if (result.gone && doc._id) {
      await PushToken.updateOne({ _id: doc._id }, { $set: { active: false } }).catch(() => {});
    }
  }
  return results;
}

module.exports = {
  getPublicVapidKey,
  isWebPushConfigured,
  sendWebPush,
  deliverToWebPush,
  ensureConfigured,
  normalizeVapidContact,
};
