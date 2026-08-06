/**
 * Reusable Firebase Cloud Messaging (FCM) sender for customer push.
 *
 * Used by unifiedNotificationService when PushToken.tokenType === 'fcm'.
 * Expo tokens are never handled here.
 *
 * Env credentials: FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY
 * (see firebaseAdmin.js).
 */

const logger = require('../../../core/utils/logger');
const {
  getFirebaseMessaging,
  ensureFirebaseAdmin,
  getFirebaseInitError,
} = require('../firebaseAdmin');

const INVALID_TOKEN_CODES = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
  'messaging/unregistered',
]);

/** Transient Admin errors worth retrying. */
const RETRYABLE_CODES = new Set([
  'messaging/internal-error',
  'messaging/server-unavailable',
  'messaging/unavailable',
  'messaging/quota-exceeded',
  'resource-exhausted',
]);

const DEFAULT_MAX_RETRIES = 2;
const MULTICAST_CHUNK = 500; // FCM multicast limit

const ORDER_TYPES = new Set([
  'ORDER_PLACED',
  'ORDER_AWAITING_PAYMENT',
  'COD_ORDER_PLACED',
  'WALLET_ORDER_PLACED',
  'ORDER_CONFIRMED',
  'ORDER_PACKED',
  'ORDER_ON_WAY',
  'ORDER_ARRIVED',
  'ORDER_DELIVERED',
  'ORDER_CANCELLED',
  'ORDER_CANCELLED_BY_STORE',
  'DELIVERY_DELAYED',
  'DELIVERY_SLA_BREACH',
  'MISSING_ITEMS',
  'PAYMENT_FAILED',
  'PAYMENT_CANCELLED',
  'PAYMENT_TIMEOUT',
  'PAYMENT_PENDING',
  'PAYMENT_RETRY_AVAILABLE',
  'PAYMENT_SUCCESS',
]);

const WALLET_TYPES = new Set([
  'WALLET_CREDIT',
  'WALLET_DEBIT',
  'WALLET_PAYMENT_FAILED',
  'REFUND_INITIATED',
  'REFUND_APPROVED',
  'REFUND_COMPLETED',
  'REFUND_REJECTED',
]);

const OFFER_TYPES = new Set(['NEW_OFFER', 'OFFER_CAMPAIGN', 'CAMPAIGN', 'PROMOTIONAL_CAMPAIGN']);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toStringData(data = {}) {
  const out = {};
  for (const [key, value] of Object.entries(data || {})) {
    if (value === undefined || value === null) continue;
    out[String(key)] = typeof value === 'string' ? value : JSON.stringify(value);
  }
  return out;
}

function isInvalidTokenError(err) {
  const code = err?.code || err?.errorInfo?.code;
  if (code && INVALID_TOKEN_CODES.has(code)) return true;
  // invalid-argument often means a bad token shape
  if (code === 'messaging/invalid-argument') {
    const message = String(err?.message || '').toLowerCase();
    return (
      message.includes('registration token') ||
      message.includes('not a valid fcm') ||
      message.includes('requested entity was not found')
    );
  }
  const message = String(err?.message || '').toLowerCase();
  return (
    message.includes('not a valid fcm registration token') ||
    message.includes('requested entity was not found') ||
    message.includes('registration-token-not-registered')
  );
}

function isRetryableError(err) {
  const code = err?.code || err?.errorInfo?.code;
  if (code && RETRYABLE_CODES.has(code)) return true;
  const message = String(err?.message || '').toLowerCase();
  return message.includes('unavailable') || message.includes('internal error');
}

/**
 * Map notification type/category → in-app screen + deep link for the mobile client.
 */
function resolveNavigationMeta(type, category, data = {}) {
  const orderId = data.orderId ? String(data.orderId) : '';
  const t = String(type || '').toUpperCase();
  const cat = String(category || data.category || '').toLowerCase();

  if (ORDER_TYPES.has(t) || cat === 'order') {
    if (t === 'ORDER_CANCELLED' || t === 'ORDER_CANCELLED_BY_STORE' || t === 'ORDER_DELIVERED') {
      return { screen: 'Orders', deepLink: 'selorg://orders' };
    }
    return {
      screen: 'OrderStatus',
      deepLink: orderId ? `selorg://order-status/${orderId}` : 'selorg://order-status',
    };
  }

  if (WALLET_TYPES.has(t) || cat === 'wallet') {
    return { screen: 'Wallet', deepLink: 'selorg://wallet' };
  }

  if (OFFER_TYPES.has(t) || cat === 'offers' || cat === 'promotional') {
    return { screen: 'Home', deepLink: 'selorg://offers' };
  }

  if (t === 'SUPPORT_REPLY') {
    return { screen: 'CustomerSupport', deepLink: 'selorg://support' };
  }

  if (t === 'WELCOME' || cat === 'welcome') {
    return { screen: 'Home', deepLink: 'selorg://home' };
  }

  return { screen: 'Notifications', deepLink: 'selorg://notifications' };
}

function resolveAndroidChannelId(type, category) {
  const t = String(type || '').toUpperCase();
  const cat = String(category || '').toLowerCase();
  if (ORDER_TYPES.has(t) || cat === 'order') return 'orders';
  if (WALLET_TYPES.has(t) || cat === 'wallet' || t.startsWith('PAYMENT_') || t.startsWith('REFUND_')) {
    return 'payments';
  }
  return 'default';
}

/**
 * Build the FCM data payload expected by the mobile app.
 */
function buildFcmDataPayload({
  notificationId,
  type,
  category,
  orderId,
  screen,
  deepLink,
  data = {},
} = {}) {
  const nav = resolveNavigationMeta(type, category, { ...data, orderId: orderId || data.orderId });
  return toStringData({
    notificationId: notificationId ? String(notificationId) : data.notificationId || '',
    type: type || data.type || '',
    category: category || data.category || '',
    orderId: orderId || data.orderId || '',
    screen: screen || data.screen || nav.screen,
    deepLink: deepLink || data.deepLink || nav.deepLink,
    ...data,
  });
}

function buildFcmMessage({ token, tokens, title, body, dataPayload, type, category }) {
  const channelId = resolveAndroidChannelId(type || dataPayload.type, category || dataPayload.category);
  const base = {
    notification: {
      title: title || 'Selorg',
      body: body || '',
    },
    data: dataPayload,
    android: {
      priority: 'high',
      notification: {
        channelId,
        sound: 'default',
      },
    },
    apns: {
      payload: {
        aps: {
          sound: 'default',
          badge: 1,
        },
      },
    },
  };
  if (token) return { ...base, token };
  if (tokens) return { ...base, tokens };
  return base;
}

/**
 * Mark invalid FCM token inactive and remove it from the database.
 * Never throws — notification sending must continue.
 */
async function handleInvalidFcmToken({ token, tokenId, userId, code } = {}) {
  try {
    const { PushToken } = require('../../models/PushToken');
    const filter = {};
    if (tokenId) {
      filter._id = tokenId;
    } else if (token && userId) {
      filter.userId = userId;
      filter.token = token;
    } else if (token) {
      filter.token = token;
    } else {
      logger.warn('handleInvalidFcmToken called without token identity');
      return { removed: false, deactivated: false };
    }

    const deactivated = await PushToken.updateMany(filter, { $set: { active: false } });
    const removed = await PushToken.deleteMany(filter);

    logger.info('Invalid FCM token cleaned up', {
      code: code || null,
      tokenPreview: token ? `${String(token).slice(0, 12)}…` : null,
      tokenId: tokenId ? String(tokenId) : null,
      deactivated: deactivated.modifiedCount || 0,
      removed: removed.deletedCount || 0,
    });

    return {
      removed: (removed.deletedCount || 0) > 0,
      deactivated: (deactivated.modifiedCount || 0) > 0,
    };
  } catch (err) {
    logger.warn('handleInvalidFcmToken failed', { err: err.message, code });
    return { removed: false, deactivated: false, error: err.message };
  }
}

/**
 * Send a single FCM notification (with optional retries for transient errors).
 *
 * @param {object} params
 * @param {string} params.token
 * @param {string} params.title
 * @param {string} params.body
 * @param {object} [params.data]
 * @param {string|ObjectId} [params.notificationId]
 * @param {string} [params.type]
 * @param {string} [params.category]
 * @param {number} [params.maxRetries]
 */
async function sendFcmNotification(params = {}) {
  const {
    token,
    title,
    body,
    data = {},
    notificationId = null,
    type = data.type,
    category = data.category,
    orderId = data.orderId,
    screen,
    deepLink,
    maxRetries = DEFAULT_MAX_RETRIES,
  } = params;

  if (!ensureFirebaseAdmin()) {
    return {
      sent: false,
      configured: false,
      error: getFirebaseInitError() || 'firebase_admin_not_configured',
    };
  }

  if (!token || typeof token !== 'string') {
    return { sent: false, error: 'missing_token', invalidToken: true };
  }

  const messaging = getFirebaseMessaging();
  if (!messaging) {
    return {
      sent: false,
      configured: false,
      error: getFirebaseInitError() || 'firebase_admin_not_configured',
    };
  }

  const dataPayload = buildFcmDataPayload({
    notificationId,
    type,
    category,
    orderId,
    screen,
    deepLink,
    data,
  });

  const message = buildFcmMessage({
    token,
    title,
    body,
    dataPayload,
    type,
    category,
  });

  let attempt = 0;
  let lastError = null;

  while (attempt <= maxRetries) {
    try {
      const messageId = await messaging.send(message);
      logger.info('FCM notification sent', {
        messageId,
        type: type || null,
        category: category || null,
        attempt,
        tokenPreview: `${token.slice(0, 12)}…`,
      });
      return { sent: true, messageId, attempt };
    } catch (err) {
      lastError = err;
      const invalidToken = isInvalidTokenError(err);

      if (invalidToken) {
        await handleInvalidFcmToken({ token, code: err?.code });
        logger.warn('FCM send failed — invalid token', {
          code: err?.code,
          err: err?.message,
        });
        return {
          sent: false,
          error: err?.message || 'fcm_invalid_token',
          code: err?.code,
          invalidToken: true,
          attempt,
        };
      }

      if (attempt < maxRetries && isRetryableError(err)) {
        const delayMs = 200 * 2 ** attempt;
        logger.warn('FCM send retrying', {
          attempt,
          delayMs,
          code: err?.code,
          err: err?.message,
        });
        await sleep(delayMs);
        attempt += 1;
        continue;
      }

      logger.warn('FCM send failed', {
        code: err?.code,
        err: err?.message,
        attempt,
      });
      return {
        sent: false,
        error: err?.message || 'fcm_send_failed',
        code: err?.code,
        invalidToken: false,
        attempt,
      };
    }
  }

  return {
    sent: false,
    error: lastError?.message || 'fcm_send_failed',
    code: lastError?.code,
    invalidToken: false,
  };
}

/**
 * Send the same notification to many FCM tokens (chunked multicast).
 * Cleans up invalid tokens per-response without aborting the batch.
 *
 * @param {object} params
 * @param {string[]|Array<{token:string,_id?:any,userId?:any}>} params.tokens
 * @param {string} params.title
 * @param {string} params.body
 * @param {object} [params.data]
 */
async function sendMulticastFcmNotification(params = {}) {
  const {
    tokens: rawTokens = [],
    title,
    body,
    data = {},
    notificationId = null,
    type = data.type,
    category = data.category,
    orderId = data.orderId,
    screen,
    deepLink,
    maxRetries = DEFAULT_MAX_RETRIES,
  } = params;

  const tokenDocs = (rawTokens || [])
    .map((t) => (typeof t === 'string' ? { token: t } : t))
    .filter((t) => t && typeof t.token === 'string' && t.token.trim());

  if (tokenDocs.length === 0) {
    return { sent: false, successCount: 0, failureCount: 0, results: [], reason: 'no_tokens' };
  }

  if (!ensureFirebaseAdmin()) {
    const error = getFirebaseInitError() || 'firebase_admin_not_configured';
    logger.warn('Skipping FCM multicast — Firebase Admin not configured');
    return {
      sent: false,
      configured: false,
      successCount: 0,
      failureCount: tokenDocs.length,
      error,
      results: tokenDocs.map((d) => ({ token: d.token, sent: false, error })),
    };
  }

  const messaging = getFirebaseMessaging();
  const dataPayload = buildFcmDataPayload({
    notificationId,
    type,
    category,
    orderId,
    screen,
    deepLink,
    data,
  });

  const allResults = [];
  let successCount = 0;
  let failureCount = 0;

  for (let i = 0; i < tokenDocs.length; i += MULTICAST_CHUNK) {
    const chunk = tokenDocs.slice(i, i + MULTICAST_CHUNK);
    const tokenStrings = chunk.map((d) => d.token);

    const multicastMessage = buildFcmMessage({
      tokens: tokenStrings,
      title,
      body,
      dataPayload,
      type,
      category,
    });

    let response = null;
    let attempt = 0;

    while (attempt <= maxRetries) {
      try {
        response = await messaging.sendEachForMulticast(multicastMessage);
        break;
      } catch (err) {
        if (attempt < maxRetries && isRetryableError(err)) {
          const delayMs = 200 * 2 ** attempt;
          logger.warn('FCM multicast retrying', { attempt, delayMs, err: err.message });
          await sleep(delayMs);
          attempt += 1;
          continue;
        }
        // Fall back to per-token sends so one bad batch does not drop all devices.
        logger.warn('FCM multicast failed — falling back to per-token send', {
          err: err.message,
          chunkSize: chunk.length,
        });
        for (const doc of chunk) {
          const single = await sendFcmNotification({
            token: doc.token,
            title,
            body,
            data,
            notificationId,
            type,
            category,
            orderId,
            screen,
            deepLink,
            maxRetries: 0,
          });
          if (single.invalidToken) {
            await handleInvalidFcmToken({
              token: doc.token,
              tokenId: doc._id,
              userId: doc.userId,
              code: single.code,
            });
          }
          allResults.push({ ...single, token: doc.token, tokenId: doc._id });
          if (single.sent) successCount += 1;
          else failureCount += 1;
        }
        response = null;
        break;
      }
    }

    if (!response) continue;

    for (let idx = 0; idx < response.responses.length; idx += 1) {
      const r = response.responses[idx];
      const doc = chunk[idx];
      if (r.success) {
        successCount += 1;
        allResults.push({
          sent: true,
          messageId: r.messageId,
          token: doc.token,
          tokenId: doc._id,
        });
      } else {
        failureCount += 1;
        const err = r.error;
        const invalidToken = isInvalidTokenError(err);
        if (invalidToken) {
          await handleInvalidFcmToken({
            token: doc.token,
            tokenId: doc._id,
            userId: doc.userId,
            code: err?.code,
          });
        }
        allResults.push({
          sent: false,
          error: err?.message || 'fcm_send_failed',
          code: err?.code,
          invalidToken,
          token: doc.token,
          tokenId: doc._id,
        });
      }
    }
  }

  logger.info('FCM multicast complete', {
    total: tokenDocs.length,
    successCount,
    failureCount,
    type: type || null,
    category: category || null,
  });

  return {
    sent: successCount > 0,
    successCount,
    failureCount,
    results: allResults,
  };
}

/**
 * Deliver to FCM token documents for a user (used by unified push channel).
 */
async function deliverToFcm(tokenDocs, title, body, data = {}) {
  return sendMulticastFcmNotification({
    tokens: tokenDocs,
    title,
    body,
    data,
    notificationId: data.notificationId,
    type: data.type,
    category: data.category,
    orderId: data.orderId,
  });
}

module.exports = {
  sendFcmNotification,
  sendMulticastFcmNotification,
  handleInvalidFcmToken,
  deliverToFcm,
  buildFcmDataPayload,
  resolveNavigationMeta,
  resolveAndroidChannelId,
  INVALID_TOKEN_CODES,
  RETRYABLE_CODES,
};
