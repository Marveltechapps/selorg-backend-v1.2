/**
 * Unified customer notification delivery pipeline.
 *
 * Every campaign and transactional notification should flow through
 * `sendNotification` so preferences, categories, DND, channels, history,
 * dedupe, and retries are enforced consistently.
 *
 * OTP / login messages must NEVER use this module.
 */
const { CustomerUser } = require('../models/CustomerUser');
const { Notification } = require('../models/Notification');
const { PushToken } = require('../models/PushToken');
const NotificationHistory = require('../../admin/models/NotificationHistory');
const logger = require('../../core/utils/logger');
const {
  resolveCategory,
  CATEGORIES,
} = require('../constants/notificationCategories');
const {
  normalizePreferences,
  resolveEnabledChannels,
} = require('./notificationPreferencesService');

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const MAX_RETRIES = 3;

const ORDER_CHANNEL_TYPES = new Set([
  'ORDER_PLACED', 'ORDER_AWAITING_PAYMENT', 'COD_ORDER_PLACED', 'WALLET_ORDER_PLACED',
  'ORDER_CONFIRMED', 'ORDER_PACKED', 'ORDER_ON_WAY',
  'ORDER_ARRIVED', 'ORDER_DELIVERED', 'ORDER_CANCELLED', 'ORDER_CANCELLED_BY_STORE',
  'DELIVERY_DELAYED', 'DELIVERY_SLA_BREACH', 'MISSING_ITEMS',
]);
const PAYMENT_CHANNEL_TYPES = new Set([
  'PAYMENT_FAILED', 'PAYMENT_CANCELLED', 'PAYMENT_TIMEOUT', 'PAYMENT_PENDING',
  'PAYMENT_RETRY_AVAILABLE', 'WALLET_PAYMENT_FAILED',
  'REFUND_INITIATED', 'REFUND_APPROVED', 'REFUND_COMPLETED', 'REFUND_REJECTED',
  'WALLET_CREDIT', 'WALLET_DEBIT', 'PAYMENT_SUCCESS',
]);

function resolveAndroidChannelId(type) {
  if (ORDER_CHANNEL_TYPES.has(type)) return 'orders';
  if (PAYMENT_CHANNEL_TYPES.has(type)) return 'payments';
  return 'default';
}

function isExpoToken(token) {
  return typeof token === 'string' && (
    token.startsWith('ExponentPushToken[') ||
    token.startsWith('ExpoPushToken[')
  );
}

function isExpoTokenDoc(doc) {
  if (!doc || doc.platform === 'web') return false;
  if (doc.tokenType === 'expo') return true;
  if (doc.tokenType === 'fcm') return false;
  // Legacy rows without tokenType: infer from token shape (unchanged Expo behavior).
  return isExpoToken(doc.token);
}

function isFcmTokenDoc(doc) {
  if (!doc || doc.platform === 'web') return false;
  return doc.tokenType === 'fcm';
}

async function deliverToExpo(tokens, title, body, data) {
  const channelId = resolveAndroidChannelId(data?.type);
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
        headers.Authorization = `Bearer ${process.env.EXPO_ACCESS_TOKEN}`;
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
          });
        }
      }
      results.push(result);
    } catch (err) {
      logger.error('Expo push delivery failed', { err: err.message, chunkSize: chunk.length });
      results.push({ error: err.message });
    }
  }
  return results.length === 1 ? results[0] : results;
}

async function recordHistory(entry) {
  try {
    return await NotificationHistory.create(entry);
  } catch (err) {
    logger.warn('NotificationHistory save failed', { err: err.message, channel: entry.channel });
    return null;
  }
}

async function deliverPushChannels({
  userId,
  title,
  body,
  data,
  type,
  category,
  campaignId,
  notificationId,
  userName,
}) {
  const tokenDocs = await PushToken.find({ userId, active: true }).lean();
  if (tokenDocs.length === 0) {
    await recordHistory({
      userId: String(userId),
      userName,
      templateName: type,
      category,
      channel: 'push',
      title,
      body,
      status: 'failed',
      failureReason: 'No active push tokens',
      campaignId,
      notificationId,
      sentAt: new Date(),
    });
    return { sent: false, reason: 'no_tokens', expo: 0, fcm: 0, web: 0 };
  }

  const expoTokens = tokenDocs.filter(isExpoTokenDoc);
  const fcmTokens = tokenDocs.filter(isFcmTokenDoc);
  const webDocs = tokenDocs.filter(
    (d) => d.platform === 'web' || d.webSubscription?.endpoint
  );

  let anySent = false;
  const failures = [];
  let fcmSuccess = 0;
  let fcmFailure = 0;

  const {
    buildFcmDataPayload,
  } = require('./notifications/fcmNotificationService');
  const pushData = buildFcmDataPayload({
    notificationId,
    type,
    category,
    orderId: data?.orderId,
    data: { type, category, ...data },
  });

  if (expoTokens.length > 0) {
    const result = await deliverToExpo(
      expoTokens.map((d) => d.token),
      title,
      body,
      pushData
    );
    const hasError = result?.error || (Array.isArray(result) && result.some((r) => r?.error));
    if (!hasError) anySent = true;
    else failures.push('expo_error');
  }

  if (fcmTokens.length > 0) {
    const { deliverToFcm } = require('./notifications/fcmNotificationService');
    const fcmResults = await deliverToFcm(fcmTokens, title, body, pushData);
    fcmSuccess = fcmResults.successCount || 0;
    fcmFailure = fcmResults.failureCount || 0;
    if (fcmResults.sent) anySent = true;
    else if (fcmTokens.length > 0) failures.push('fcm_failed');
  }

  if (webDocs.length > 0) {
    const { deliverToWebPush } = require('./webPushService');
    const webResults = await deliverToWebPush(webDocs, title, body, pushData);
    if (webResults.some((r) => r.sent)) anySent = true;
    else if (webResults.length > 0) failures.push('web_push_failed');
  }

  await recordHistory({
    userId: String(userId),
    userName,
    templateName: type,
    category,
    channel: 'push',
    title,
    body,
    status: anySent ? 'sent' : 'failed',
    failureReason: anySent ? undefined : failures.join(',') || 'push_failed',
    campaignId,
    notificationId,
    sentAt: new Date(),
    deliveredAt: anySent ? new Date() : undefined,
  });

  return {
    sent: anySent,
    expo: expoTokens.length,
    fcm: fcmTokens.length,
    fcmSuccess,
    fcmFailure,
    web: webDocs.length,
  };
}

/**
 * Core send — preference + category gated multi-channel delivery.
 *
 * @param {object} params
 * @param {string|ObjectId} params.userId
 * @param {string} params.title
 * @param {string} params.body
 * @param {string} [params.type]
 * @param {string} [params.category]
 * @param {object} [params.data]
 * @param {string[]} [params.channels] — requested channels (intersected with prefs)
 * @param {string} [params.dedupeKey]
 * @param {string|ObjectId} [params.campaignId]
 * @param {object} [params.user] — optional preloaded user lean doc
 */
async function sendNotification(params) {
  const {
    userId,
    title,
    body,
    type = 'SYSTEM_ANNOUNCEMENT',
    category: explicitCategory,
    data = {},
    channels: requestedChannels,
    dedupeKey: rawDedupeKey = null,
    campaignId = null,
    user: preloadedUser = null,
  } = params;

  if (!userId || !title) {
    return { success: false, error: 'userId and title are required' };
  }

  const category = resolveCategory(type, explicitCategory || data.category);
  const dedupeKey =
    typeof rawDedupeKey === 'string' && rawDedupeKey.trim() !== ''
      ? rawDedupeKey.trim()
      : null;

  try {
    const user =
      preloadedUser ||
      (await CustomerUser.findById(userId)
        .select('notificationPreferences phoneNumber email name savedCheckoutContact.email')
        .lean());

    if (!user) {
      return { success: false, error: 'user_not_found' };
    }

    const prefs = normalizePreferences(user.notificationPreferences);
    const enabledChannels = resolveEnabledChannels(prefs, category, requestedChannels);

    if (enabledChannels.length === 0) {
      logger.info('Notification skipped — no enabled channels for category', {
        userId: String(userId),
        type,
        category,
      });
      await recordHistory({
        userId: String(userId),
        userName: user.name,
        templateName: type,
        category,
        channel: 'push',
        title,
        body,
        status: 'skipped',
        failureReason: 'preferences_or_category_disabled',
        campaignId,
        sentAt: new Date(),
        dedupeKey,
      });
      return { success: true, skipped: true, reason: 'preferences', category };
    }

    const inAppAllowed = enabledChannels.includes('inApp');
    const pushAllowed = enabledChannels.includes('push');
    const smsAllowed = enabledChannels.includes('sms');
    const whatsappAllowed = enabledChannels.includes('whatsapp');
    const emailAllowed = enabledChannels.includes('email');

    let notificationId = null;
    let inboxCreated = false;

    const shouldWriteInbox = inAppAllowed;
    const shouldClaimDedupe =
      Boolean(dedupeKey) &&
      (shouldWriteInbox || pushAllowed || smsAllowed || whatsappAllowed || emailAllowed);

    if (shouldClaimDedupe || shouldWriteInbox) {
      if (dedupeKey) {
        try {
          const existing = await Notification.findOneAndUpdate(
            { dedupeKey },
            {
              $setOnInsert: {
                userId,
                title,
                body,
                category,
                read: shouldWriteInbox ? false : true,
                suppressed: !shouldWriteInbox,
                data: { type, category, ...data },
                deliveryStatus: 'pending',
                channelsAttempted: enabledChannels,
              },
            },
            { upsert: true, new: false }
          ).lean();
          if (existing) {
            logger.info('Notification deduplicated', { userId: String(userId), type, dedupeKey });
            return { success: true, skipped: true, reason: 'duplicate', dedupeKey };
          }
          const created = await Notification.findOne({ dedupeKey }).lean();
          notificationId = created?._id;
          inboxCreated = shouldWriteInbox;
        } catch (err) {
          if (err && (err.code === 11000 || String(err.message || '').includes('E11000'))) {
            return { success: true, skipped: true, reason: 'duplicate', dedupeKey };
          }
          logger.warn('Notification upsert failed', { err: err.message });
        }
      } else if (shouldWriteInbox) {
        const created = await Notification.create({
          userId,
          title,
          body,
          category,
          data: { type, category, ...data },
          deliveryStatus: 'pending',
          channelsAttempted: enabledChannels,
        }).catch((err) => {
          logger.warn('In-app notification save failed', { err: err.message });
          return null;
        });
        notificationId = created?._id;
        inboxCreated = Boolean(created);
      }
    }

    if (inAppAllowed && inboxCreated) {
      await recordHistory({
        userId: String(userId),
        userName: user.name,
        templateName: type,
        category,
        channel: 'in-app',
        title,
        body,
        status: 'delivered',
        campaignId,
        notificationId,
        sentAt: new Date(),
        deliveredAt: new Date(),
        dedupeKey,
      });
    }

    const delivered = [];
    const failed = [];
    const attempted = [...enabledChannels];

    // Push (Expo mobile + Web Push browser) in parallel with alternate channels
    const tasks = [];

    if (pushAllowed) {
      tasks.push(
        deliverPushChannels({
          userId,
          title,
          body,
          data,
          type,
          category,
          campaignId,
          notificationId,
          userName: user.name,
        }).then((r) => {
          if (r.sent) delivered.push('push');
          else failed.push('push');
        })
      );
    }

    if (smsAllowed || whatsappAllowed || emailAllowed) {
      const { deliverPreferenceChannels } = require('./channelDeliveryService');
      // Temporarily narrow prefs so channelDeliveryService only sends allowed ones
      const channelPrefs = {
        ...prefs,
        sms: smsAllowed,
        whatsapp: whatsappAllowed,
        email: emailAllowed,
      };
      tasks.push(
        deliverPreferenceChannels({
          customerId: userId,
          user,
          preferences: channelPrefs,
          type,
          title,
          body,
        }).then((channels) => {
          if (channels.sms?.sent) delivered.push('sms');
          else if (smsAllowed && channels.sms && !channels.sms.skipped) failed.push('sms');
          if (channels.whatsapp?.sent) delivered.push('whatsapp');
          else if (whatsappAllowed && channels.whatsapp && !channels.whatsapp.skipped) {
            failed.push('whatsapp');
          }
          if (channels.email?.sent) delivered.push('email');
          else if (emailAllowed && channels.email && !channels.email.skipped) failed.push('email');
        })
      );
    }

    await Promise.allSettled(tasks);

    if (inAppAllowed && inboxCreated) delivered.push('inApp');

    const deliveryStatus =
      delivered.length === 0
        ? failed.length > 0
          ? 'failed'
          : 'skipped'
        : failed.length > 0
          ? 'partial'
          : 'delivered';

    if (notificationId) {
      await Notification.updateOne(
        { _id: notificationId },
        {
          $set: {
            deliveryStatus,
            channelsAttempted: attempted,
            channelsDelivered: delivered,
            failureReason: failed.length ? failed.join(',') : null,
          },
        }
      ).catch(() => {});
    }

    return {
      success: true,
      category,
      notificationId,
      delivered,
      failed,
      deliveryStatus,
      inboxCreated,
    };
  } catch (err) {
    logger.error('sendNotification error', {
      err: err.message,
      userId: String(userId),
      type,
    });
    return { success: false, error: err.message };
  }
}

/**
 * Retry a failed history row by re-sending through the unified pipeline.
 */
async function retryFailedNotification(historyId) {
  const history = await NotificationHistory.findById(historyId);
  if (!history) return { success: false, error: 'History record not found' };
  if (history.status !== 'failed' && history.status !== 'skipped') {
    return { success: false, error: 'Only failed/skipped notifications can be retried' };
  }
  if ((history.retryCount || 0) >= MAX_RETRIES) {
    return { success: false, error: `Max retries (${MAX_RETRIES}) exceeded` };
  }

  const channelMap = {
    push: ['push'],
    'web-push': ['push'],
    'in-app': ['inApp'],
    sms: ['sms'],
    whatsapp: ['whatsapp'],
    email: ['email'],
  };
  const channels = channelMap[history.channel] || ['push', 'inApp'];

  const result = await sendNotification({
    userId: history.userId,
    title: history.title,
    body: history.body,
    type: history.templateName || 'SYSTEM_ANNOUNCEMENT',
    category: history.category || CATEGORIES.SYSTEM,
    channels,
    campaignId: history.campaignId,
    data: { retryOf: String(historyId) },
  });

  history.retryCount = (history.retryCount || 0) + 1;
  if (result.success && !result.skipped) {
    history.status = 'sent';
    history.failureReason = undefined;
    history.deliveredAt = new Date();
  } else if (result.error) {
    history.failureReason = result.error;
  }
  await history.save();

  return { success: true, result, retryCount: history.retryCount };
}

/**
 * Bulk retry all failed history rows for a campaign (or globally, capped).
 */
async function retryFailedBatch({ campaignId = null, limit = 100 } = {}) {
  const filter = { status: 'failed', retryCount: { $lt: MAX_RETRIES } };
  if (campaignId) filter.campaignId = campaignId;
  const rows = await NotificationHistory.find(filter).sort({ sentAt: -1 }).limit(limit);
  const outcomes = [];
  for (const row of rows) {
    outcomes.push(await retryFailedNotification(row._id));
  }
  return {
    success: true,
    attempted: outcomes.length,
    succeeded: outcomes.filter((o) => o.success && o.result && !o.result.skipped).length,
  };
}

module.exports = {
  sendNotification,
  deliverToExpo,
  retryFailedNotification,
  retryFailedBatch,
  MAX_RETRIES,
};
