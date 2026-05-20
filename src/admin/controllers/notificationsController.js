const NotificationTemplate = require('../models/NotificationTemplate');
const NotificationCampaign = require('../models/NotificationCampaign');
const NotificationScheduled = require('../models/NotificationScheduled');
const NotificationAutomation = require('../models/NotificationAutomation');
const NotificationHistory = require('../models/NotificationHistory');
const { dispatchCampaign } = require('../services/campaignDispatchService');
const { invalidateNotifications } = require('../cacheInvalidation');
const logger = require('../../core/utils/logger');
const { asyncHandler } = require('../../core/middleware');

/** Extract variables from template body (e.g. {{user_name}} -> user_name) */
function extractVariables(body) {
  if (!body || typeof body !== 'string') return [];
  const matches = body.match(/\{\{([^}]+)\}\}/g);
  return matches ? [...new Set(matches.map((m) => m.replace(/\{\{|\}\}/g, '').trim()))] : [];
}

/** Normalize template for response */
function toTemplate(doc) {
  const o = doc.toJSON ? doc.toJSON() : doc;
  return {
    ...o,
    variables: o.variables || extractVariables(o.body),
    lastUsed: o.lastUsed || null,
  };
}

const notificationsController = {
  // --- Templates ---
  listTemplates: asyncHandler(async (req, res) => {
    const templates = await NotificationTemplate.find().sort({ createdAt: -1 }).lean();
    const data = templates.map((t) => ({
      ...t,
      id: t._id.toString(),
      _id: undefined,
      variables: t.variables || extractVariables(t.body),
      lastUsed: t.lastUsed || null,
    }));
    res.json({ success: true, data });
  }),

  createTemplate: asyncHandler(async (req, res) => {
    const { name, title, body, category, channels, variables, imageUrl, deepLink, priority, status } = req.body;
    const vars = variables || extractVariables(body);
    const template = await NotificationTemplate.create({
      name: name || 'New Template',
      title: title || '',
      body: body || '',
      category: category || 'promotional',
      channels: channels && Array.isArray(channels) ? channels : ['push'],
      variables: vars,
      imageUrl,
      deepLink,
      priority: priority || 'medium',
      status: status || 'active',
    });
    await invalidateNotifications().catch(() => {});
    const data = toTemplate(template);
    res.status(201).json({ success: true, data });
  }),

  updateTemplate: asyncHandler(async (req, res) => {
    const template = await NotificationTemplate.findByIdAndUpdate(
      req.params.id,
      { $set: req.body },
      { new: true, runValidators: true }
    );
    if (!template) return res.status(404).json({ success: false, message: 'Template not found' });
    await invalidateNotifications().catch(() => {});
    const data = toTemplate(template);
    res.json({ success: true, data });
  }),

  deleteTemplate: asyncHandler(async (req, res) => {
    const result = await NotificationTemplate.findByIdAndDelete(req.params.id);
    if (!result) return res.status(404).json({ success: false, message: 'Template not found' });
    await invalidateNotifications().catch(() => {});
    res.json({ success: true });
  }),

  // --- Campaigns ---
  listCampaigns: asyncHandler(async (req, res) => {
    const campaigns = await NotificationCampaign.find().populate('templateId', 'name').sort({ createdAt: -1 }).lean();
    const data = campaigns.map((c) => ({
      ...c,
      id: c._id.toString(),
      _id: undefined,
      templateId: c.templateId?._id?.toString() || c.templateId?.toString() || c.templateId,
      templateName: c.templateName || c.templateId?.name || 'N/A',
    }));
    res.json({ success: true, data });
  }),

  getCampaignById: asyncHandler(async (req, res) => {
    const campaign = await NotificationCampaign.findById(req.params.id)
      .populate('templateId', 'name')
      .lean();
    if (!campaign) {
      return res.status(404).json({ success: false, message: 'Campaign not found' });
    }
    const data = {
      ...campaign,
      id: campaign._id.toString(),
      _id: undefined,
      templateId: campaign.templateId?._id?.toString() || campaign.templateId?.toString() || campaign.templateId,
      templateName: campaign.templateName || campaign.templateId?.name || 'N/A',
    };
    res.json({ success: true, data });
  }),

  createCampaign: asyncHandler(async (req, res) => {
    const { name, templateId, templateName, segment, channels, scheduleType, scheduledAt } = req.body;

    if (!name || !String(name).trim()) {
      return res.status(400).json({ success: false, message: 'Campaign name is required' });
    }
    if (!templateId) {
      return res.status(400).json({ success: false, message: 'templateId is required' });
    }

    const template = await NotificationTemplate.findById(templateId);
    if (!template) return res.status(404).json({ success: false, message: 'Template not found' });

    const isImmediate = scheduleType === 'immediate' || !scheduleType;
    if (!isImmediate && !scheduledAt) {
      return res.status(400).json({
        success: false,
        message: 'Schedule date and time is required for scheduled campaigns',
      });
    }

    const campaignChannels =
      channels && Array.isArray(channels) && channels.length > 0
        ? channels
        : template.channels?.length > 0
          ? template.channels
          : ['push'];

    let campaign = await NotificationCampaign.create({
      name: String(name).trim(),
      templateId,
      templateName: templateName || template.name,
      segment: segment || 'all',
      channels: campaignChannels,
      status: isImmediate ? 'active' : 'scheduled',
      scheduledAt: isImmediate ? undefined : scheduledAt ? new Date(scheduledAt) : undefined,
      startedAt: isImmediate ? new Date() : undefined,
      targetUsers: 0,
      sentCount: 0,
      deliveredCount: 0,
      openedCount: 0,
      clickedCount: 0,
      deliveryRate: 0,
      openRate: 0,
      clickRate: 0,
      createdBy: req.user?.email || req.user?.name || 'admin',
    });

    if (!isImmediate && scheduledAt) {
      await NotificationScheduled.create({
        campaignId: campaign._id,
        campaignName: campaign.name,
        templateName: campaign.templateName,
        scheduledAt: new Date(scheduledAt),
        targetUsers: 0,
        channels: campaign.channels,
        status: 'pending',
        createdBy: campaign.createdBy,
      });
    } else if (isImmediate) {
      try {
        await dispatchCampaign(campaign, template);
        campaign = await NotificationCampaign.findById(campaign._id);
      } catch (err) {
        logger.error('Campaign dispatch failed', {
          campaignId: campaign._id.toString(),
          err: err.message,
        });
      }
    }

    await invalidateNotifications().catch(() => {});

    const data = campaign.toJSON();
    res.status(201).json({ success: true, data });
  }),

  updateCampaignStatus: asyncHandler(async (req, res) => {
    const { status } = req.body;
    const campaign = await NotificationCampaign.findByIdAndUpdate(
      req.params.id,
      { $set: { status } },
      { new: true }
    );
    if (!campaign) return res.status(404).json({ success: false, message: 'Campaign not found' });
    await invalidateNotifications().catch(() => {});
    res.json({ success: true });
  }),

  // --- Scheduled ---
  listScheduled: asyncHandler(async (req, res) => {
    const scheduled = await NotificationScheduled.find({ status: { $in: ['pending', 'processing'] } })
      .sort({ scheduledAt: 1 })
      .lean();
    const data = scheduled.map((s) => ({
      ...s,
      id: s._id.toString(),
      _id: undefined,
      campaignId: s.campaignId?.toString(),
    }));
    res.json({ success: true, data });
  }),

  // --- Automation ---
  listAutomation: asyncHandler(async (req, res) => {
    const rules = await NotificationAutomation.find()
      .populate('templateId', 'name')
      .sort({ createdAt: -1 })
      .lean();
    const data = rules.map((r) => ({
      ...r,
      id: r._id.toString(),
      _id: undefined,
      templateId: r.templateId?._id?.toString() || r.templateId?.toString(),
      templateName: r.templateName || r.templateId?.name || 'N/A',
    }));
    res.json({ success: true, data });
  }),

  createAutomation: asyncHandler(async (req, res) => {
    const { name, trigger, templateId, delay, channels, conditions, status } = req.body;
    if (!name || !String(name).trim()) {
      return res.status(400).json({ success: false, message: 'Rule name is required' });
    }
    if (!templateId) {
      return res.status(400).json({ success: false, message: 'templateId is required' });
    }
    if (!Array.isArray(channels) || channels.length === 0) {
      return res.status(400).json({ success: false, message: 'At least one channel is required' });
    }
    const template = await NotificationTemplate.findById(templateId);
    if (!template) return res.status(404).json({ success: false, message: 'Template not found' });
    const rule = await NotificationAutomation.create({
      name: name || 'New Rule',
      trigger: trigger || 'order_placed',
      templateId,
      templateName: template.name,
      delay: typeof delay === 'number' ? delay : parseInt(delay, 10) || 0,
      channels: channels && Array.isArray(channels) ? channels : ['push'],
      conditions,
      status: status || 'active',
      totalTriggered: 0,
      successRate: 0,
    });
    const data = rule.toJSON();
    await invalidateNotifications().catch(() => {});
    res.status(201).json({ success: true, data });
  }),

  updateAutomation: asyncHandler(async (req, res) => {
    const { status, name, trigger, templateId, delay, channels, conditions } = req.body;
    const rule = await NotificationAutomation.findById(req.params.id);
    if (!rule) return res.status(404).json({ success: false, message: 'Automation rule not found' });

    const isFullUpdate =
      name !== undefined ||
      trigger !== undefined ||
      templateId !== undefined ||
      delay !== undefined ||
      channels !== undefined ||
      conditions !== undefined;

    if (!isFullUpdate) {
      if (status === undefined) {
        return res.status(400).json({ success: false, message: 'No fields to update' });
      }
      rule.status = status;
      await rule.save();
      await invalidateNotifications().catch(() => {});
      return res.json({ success: true });
    }

    if (name !== undefined) {
      if (!name || !String(name).trim()) {
        return res.status(400).json({ success: false, message: 'Rule name is required' });
      }
      rule.name = String(name).trim();
    }
    if (trigger !== undefined) {
      rule.trigger = trigger;
    }
    if (templateId !== undefined) {
      const template = await NotificationTemplate.findById(templateId);
      if (!template) return res.status(404).json({ success: false, message: 'Template not found' });
      rule.templateId = templateId;
      rule.templateName = template.name;
    }
    if (delay !== undefined) {
      rule.delay = typeof delay === 'number' ? delay : parseInt(delay, 10) || 0;
    }
    if (channels !== undefined) {
      if (!Array.isArray(channels) || channels.length === 0) {
        return res.status(400).json({ success: false, message: 'At least one channel is required' });
      }
      rule.channels = channels;
    }
    if (conditions !== undefined) {
      rule.conditions = conditions;
    }
    if (status !== undefined) {
      rule.status = status;
    }

    await rule.save();
    await invalidateNotifications().catch(() => {});

    const populated = await NotificationAutomation.findById(rule._id)
      .populate('templateId', 'name')
      .lean();
    const data = {
      ...populated,
      id: populated._id.toString(),
      _id: undefined,
      templateId: populated.templateId?._id?.toString() || populated.templateId?.toString(),
      templateName: populated.templateName || populated.templateId?.name || 'N/A',
    };
    res.json({ success: true, data });
  }),

  // --- Analytics ---
  getAnalytics: asyncHandler(async (req, res) => {
    const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const history = await NotificationHistory.find({ sentAt: { $gte: last24h } }).lean();
    const totalSent = history.length;
    const totalDelivered = history.filter((h) => ['delivered', 'opened', 'clicked'].includes(h.status)).length;
    const totalOpened = history.filter((h) => ['opened', 'clicked'].includes(h.status)).length;
    const totalClicked = history.filter((h) => h.status === 'clicked').length;
    const failedCount = history.filter((h) => h.status === 'failed' || h.status === 'bounced').length;
    res.json({
      success: true,
      data: {
        totalSent,
        totalDelivered,
        totalOpened,
        totalClicked,
        deliveryRate: totalSent > 0 ? Math.round((totalDelivered / totalSent) * 1000) / 10 : 0,
        openRate: totalDelivered > 0 ? Math.round((totalOpened / totalDelivered) * 1000) / 10 : 0,
        clickRate: totalDelivered > 0 ? Math.round((totalClicked / totalDelivered) * 1000) / 10 : 0,
        avgDeliveryTime: 2.3,
        failedCount,
        bounceRate: totalSent > 0 ? Math.round((failedCount / totalSent) * 1000) / 10 : 0,
      },
    });
  }),

  // --- History ---
  listHistory: asyncHandler(async (req, res) => {
    const history = await NotificationHistory.find().sort({ sentAt: -1 }).limit(500).lean();
    const data = history.map((h) => ({
      ...h,
      id: h._id.toString(),
      _id: undefined,
    }));
    res.json({ success: true, data });
  }),

  // --- Channel performance ---
  getChannels: asyncHandler(async (req, res) => {
    const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const history = await NotificationHistory.find({ sentAt: { $gte: last24h } }).lean();
    const channels = ['push', 'sms', 'email', 'in-app'];
    const data = channels.map((ch) => {
      const byCh = history.filter((h) => h.channel === ch);
      const sent = byCh.length;
      const delivered = byCh.filter((h) => ['delivered', 'opened', 'clicked'].includes(h.status)).length;
      const opened = byCh.filter((h) => ['opened', 'clicked'].includes(h.status)).length;
      const clicked = byCh.filter((h) => h.status === 'clicked').length;
      return {
        channel: ch,
        sent,
        delivered,
        opened,
        clicked,
        deliveryRate: sent > 0 ? Math.round((delivered / sent) * 1000) / 10 : 0,
        openRate: delivered > 0 ? Math.round((opened / delivered) * 1000) / 10 : 0,
        clickRate: delivered > 0 ? Math.round((clicked / delivered) * 1000) / 10 : 0,
      };
    });
    res.json({ success: true, data });
  }),

  // --- Time series ---
  getTimeSeries: asyncHandler(async (req, res) => {
    const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const history = await NotificationHistory.find({ sentAt: { $gte: last24h } }).lean();
    const buckets = {};
    for (let i = 0; i < 24; i++) {
      const d = new Date(last24h);
      d.setHours(d.getHours() + i, 0, 0, 0);
      const key = d.toISOString();
      buckets[key] = { timestamp: key, sent: 0, delivered: 0, opened: 0, clicked: 0 };
    }
    history.forEach((h) => {
      const d = new Date(h.sentAt);
      d.setMinutes(0, 0, 0);
      const key = d.toISOString();
      if (buckets[key]) {
        buckets[key].sent += 1;
        if (['delivered', 'opened', 'clicked'].includes(h.status)) buckets[key].delivered += 1;
        if (['opened', 'clicked'].includes(h.status)) buckets[key].opened += 1;
        if (h.status === 'clicked') buckets[key].clicked += 1;
      }
    });
    const data = Object.values(buckets).sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    res.json({ success: true, data });
  }),
};

module.exports = notificationsController;
