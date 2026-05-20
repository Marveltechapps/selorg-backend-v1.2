/**
 * Dispatches admin notification campaigns to customer segments.
 */
const { CustomerUser } = require('../../customer-backend/models/CustomerUser');
const { PushToken } = require('../../customer-backend/models/PushToken');
const { Notification } = require('../../customer-backend/models/Notification');
const NotificationHistory = require('../models/NotificationHistory');
const NotificationCampaign = require('../models/NotificationCampaign');
const NotificationTemplate = require('../models/NotificationTemplate');
const { deliverToExpo } = require('../../customer-backend/services/notificationService');
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

async function processBatch(users, campaign, template, channels) {
  let sent = 0;
  let delivered = 0;
  const historyRecords = [];

  for (const user of users) {
    const displayName = user.name || user.email || user.phoneNumber || 'Customer';
    const vars = { user_name: displayName, name: displayName };
    const title = fillTemplateVariables(template.title, vars);
    const body = fillTemplateVariables(template.body, vars);
    const userId = user._id.toString();

    for (const channel of channels) {
      if (channel === 'in-app') {
        await Notification.create({
          userId: user._id,
          title,
          body,
          data: { campaignId: campaign._id.toString(), type: 'campaign' },
        }).catch((err) => {
          logger.warn('In-app campaign notification failed', { userId, err: err.message });
        });
        sent += 1;
        delivered += 1;
        historyRecords.push({
          userId,
          userName: displayName,
          templateName: template.name,
          title,
          body,
          channel: 'in-app',
          status: 'delivered',
          sentAt: new Date(),
          deliveredAt: new Date(),
          campaignId: campaign._id,
        });
      } else if (channel === 'push') {
        const tokenDocs = await PushToken.find({ userId: user._id, active: true }).lean();
        const tokens = tokenDocs.map((d) => d.token).filter(Boolean);
        if (tokens.length > 0) {
          await deliverToExpo(tokens, title, body, {
            type: 'campaign',
            campaignId: campaign._id.toString(),
          });
          sent += 1;
          delivered += 1;
        }
        historyRecords.push({
          userId,
          userName: displayName,
          templateName: template.name,
          title,
          body,
          channel: 'push',
          status: tokens.length > 0 ? 'sent' : 'failed',
          sentAt: new Date(),
          failureReason: tokens.length === 0 ? 'No active push tokens' : undefined,
          campaignId: campaign._id,
        });
      }
    }
  }

  if (historyRecords.length > 0) {
    await NotificationHistory.insertMany(historyRecords, { ordered: false }).catch((err) => {
      logger.warn('Campaign history insert failed', { err: err.message });
    });
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
        : ['push'];

  let targetUsers = 0;
  let sentCount = 0;
  let deliveredCount = 0;
  let batch = [];

  const cursor = CustomerUser.find(filter).select('_id name email phoneNumber').cursor();

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

module.exports = { dispatchCampaign, buildSegmentFilter, fillTemplateVariables };
