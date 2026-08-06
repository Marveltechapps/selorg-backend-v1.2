/**
 * Polls pending scheduled notification campaigns and dispatches them.
 */
const NotificationScheduled = require('../../admin/models/NotificationScheduled');
const NotificationCampaign = require('../../admin/models/NotificationCampaign');
const NotificationTemplate = require('../../admin/models/NotificationTemplate');
const { dispatchCampaign } = require('../../admin/services/campaignDispatchService');
const logger = require('../../core/utils/logger');

let timer = null;
let running = false;

async function processDueScheduled() {
  if (running) return;
  running = true;
  try {
    const now = new Date();
    const due = await NotificationScheduled.find({
      status: 'pending',
      scheduledAt: { $lte: now },
    })
      .sort({ scheduledAt: 1 })
      .limit(10);

    for (const row of due) {
      const claimed = await NotificationScheduled.findOneAndUpdate(
        { _id: row._id, status: 'pending' },
        { $set: { status: 'processing' } },
        { new: true }
      );
      if (!claimed) continue;

      try {
        const campaign = await NotificationCampaign.findById(claimed.campaignId);
        if (!campaign) {
          await NotificationScheduled.updateOne(
            { _id: claimed._id },
            { $set: { status: 'failed' } }
          );
          continue;
        }
        const template = await NotificationTemplate.findById(campaign.templateId);
        if (!template) {
          await NotificationScheduled.updateOne(
            { _id: claimed._id },
            { $set: { status: 'failed' } }
          );
          await NotificationCampaign.updateOne(
            { _id: campaign._id },
            { $set: { status: 'failed' } }
          );
          continue;
        }

        await NotificationCampaign.updateOne(
          { _id: campaign._id },
          { $set: { status: 'active', startedAt: new Date() } }
        );

        const stats = await dispatchCampaign(campaign, template);

        await NotificationScheduled.updateOne(
          { _id: claimed._id },
          {
            $set: {
              status: 'sent',
              targetUsers: stats.targetUsers,
            },
          }
        );

        // Recurring: enqueue next occurrence
        if (claimed.recurring) {
          const next = new Date(claimed.scheduledAt);
          if (claimed.recurring === 'daily') next.setDate(next.getDate() + 1);
          else if (claimed.recurring === 'weekly') next.setDate(next.getDate() + 7);
          else if (claimed.recurring === 'monthly') next.setMonth(next.getMonth() + 1);

          const nextCampaign = await NotificationCampaign.create({
            name: `${campaign.name} (${claimed.recurring})`,
            templateId: campaign.templateId,
            templateName: campaign.templateName,
            segment: campaign.segment,
            channels: campaign.channels,
            status: 'scheduled',
            scheduledAt: next,
            createdBy: campaign.createdBy,
          });
          await NotificationScheduled.create({
            campaignId: nextCampaign._id,
            campaignName: nextCampaign.name,
            templateName: nextCampaign.templateName,
            scheduledAt: next,
            channels: nextCampaign.channels,
            recurring: claimed.recurring,
            status: 'pending',
            createdBy: claimed.createdBy,
          });
        }

        logger.info('Scheduled campaign dispatched', {
          scheduledId: String(claimed._id),
          campaignId: String(campaign._id),
          ...stats,
        });
      } catch (err) {
        logger.error('Scheduled campaign dispatch failed', {
          scheduledId: String(claimed._id),
          err: err.message,
        });
        await NotificationScheduled.updateOne(
          { _id: claimed._id },
          { $set: { status: 'failed' } }
        );
        if (claimed.campaignId) {
          await NotificationCampaign.updateOne(
            { _id: claimed.campaignId },
            { $set: { status: 'failed' } }
          ).catch(() => {});
        }
      }
    }
  } catch (err) {
    logger.error('processDueScheduled error', { err: err.message });
  } finally {
    running = false;
  }
}

function start(intervalMs = 30 * 1000) {
  if (timer) return;
  processDueScheduled().catch(() => {});
  timer = setInterval(() => {
    processDueScheduled().catch(() => {});
  }, intervalMs);
  if (typeof timer.unref === 'function') timer.unref();
  logger.info('Notification scheduler job started', { intervalMs });
}

function stop() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

module.exports = { start, stop, processDueScheduled };
