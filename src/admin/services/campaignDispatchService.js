/**
 * Dispatches admin notification campaigns through the unified notification pipeline.
 * Respects user channel + category preferences for every recipient.
 */
const { CustomerUser } = require('../../customer-backend/models/CustomerUser');
const NotificationCampaign = require('../models/NotificationCampaign');
const NotificationTemplate = require('../models/NotificationTemplate');
const { sendNotification } = require('../../customer-backend/services/unifiedNotificationService');
const { resolveCategory } = require('../../customer-backend/constants/notificationCategories');
const logger = require('../../core/utils/logger');

const BATCH_SIZE = 200;

function fillTemplateVariables(text, vars) {
  if (!text || typeof text !== 'string') return '';
  return text.replace(/\{\{([^}]+)\}\}/g, (_, key) => vars[key.trim()] ?? '');
}

function buildSegmentFilter(segment) {
  const now = new Date();
  switch (segment) {
    case 'vip':
      return {
        status: 'active',
        $or: [
          { 'meta.isVip': true },
          { 'meta.tags': 'vip' },
          { loginCount: { $gte: 20 } },
        ],
      };
    case 'new':
      return {
        status: 'active',
        createdAt: { $gte: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) },
      };
    case 'inactive': {
      const cutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      return {
        status: 'active',
        $or: [
          { lastLogin: { $lt: cutoff } },
          { lastLogin: null, createdAt: { $lt: cutoff } },
        ],
      };
    }
    case 'all':
    default:
      return { status: 'active' };
  }
}

/** Map admin channel names → unified preference channel keys. */
function mapChannels(channels) {
  const set = new Set();
  for (const ch of channels || []) {
    if (ch === 'in-app' || ch === 'inApp') set.add('inApp');
    else if (ch === 'push' || ch === 'web-push') set.add('push');
    else if (ch === 'sms') set.add('sms');
    else if (ch === 'whatsapp' || ch === 'wa') set.add('whatsapp');
    else if (ch === 'email') set.add('email');
  }
  return [...set];
}

async function processBatch(users, campaign, template, channels) {
  let sent = 0;
  let delivered = 0;
  const category = resolveCategory(template.category);
  const requested = mapChannels(channels);

  for (const user of users) {
    const displayName = user.name || user.email || user.phoneNumber || 'Customer';
    const vars = { user_name: displayName, name: displayName };
    const title = fillTemplateVariables(template.title, vars);
    const body = fillTemplateVariables(template.body, vars);
    const userId = user._id;

    const result = await sendNotification({
      userId,
      title,
      body,
      type: 'CAMPAIGN',
      category,
      channels: requested.length ? requested : undefined,
      campaignId: campaign._id,
      user,
      data: {
        campaignId: campaign._id.toString(),
        type: 'campaign',
        category,
        deepLink: template.deepLink || undefined,
        imageUrl: template.imageUrl || undefined,
      },
      dedupeKey: `campaign:${campaign._id}:${userId}`,
    });

    sent += 1;
    if (result.success && !result.skipped && (result.delivered?.length > 0 || result.inboxCreated)) {
      delivered += 1;
    }
  }

  return { sent, delivered };
}

/**
 * Send campaign to all users matching segment; updates campaign metrics.
 */
async function dispatchCampaign(campaign, template) {
  const filter = buildSegmentFilter(campaign.segment);
  const channels =
    campaign.channels?.length > 0
      ? campaign.channels
      : template.channels?.length > 0
        ? template.channels
        : ['push', 'in-app'];

  let targetUsers = 0;
  let sentCount = 0;
  let deliveredCount = 0;
  let batch = [];

  const cursor = CustomerUser.find(filter)
    .select('_id name email phoneNumber notificationPreferences savedCheckoutContact')
    .cursor();

  for await (const user of cursor) {
    batch.push(user);
    if (batch.length >= BATCH_SIZE) {
      const stats = await processBatch(batch, campaign, template, channels);
      sentCount += stats.sent;
      deliveredCount += stats.delivered;
      targetUsers += batch.length;
      batch = [];
    }
  }

  if (batch.length > 0) {
    const stats = await processBatch(batch, campaign, template, channels);
    sentCount += stats.sent;
    deliveredCount += stats.delivered;
    targetUsers += batch.length;
  }

  const deliveryRate =
    sentCount > 0 ? Math.round((deliveredCount / sentCount) * 1000) / 10 : 0;

  await NotificationCampaign.findByIdAndUpdate(campaign._id, {
    targetUsers,
    sentCount,
    deliveredCount,
    deliveryRate,
    status: 'completed',
    completedAt: new Date(),
  });

  await NotificationTemplate.findByIdAndUpdate(template._id, {
    $inc: { totalSent: sentCount },
    $set: { lastUsed: new Date() },
  });

  logger.info('Campaign dispatched', {
    campaignId: campaign._id.toString(),
    targetUsers,
    sentCount,
    deliveredCount,
  });

  return { targetUsers, sentCount, deliveredCount, deliveryRate };
}

module.exports = { dispatchCampaign, buildSegmentFilter, fillTemplateVariables, mapChannels };
