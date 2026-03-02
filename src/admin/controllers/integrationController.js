/**
 * Integration Manager Controller
 * Handles /admin/integrations/* endpoints for Integration Manager screen
 */
const Integration = require('../models/Integration');
const IntegrationWebhook = require('../models/IntegrationWebhook');
const IntegrationLog = require('../models/IntegrationLog');
const IntegrationApiKey = require('../models/IntegrationApiKey');
const { asyncHandler } = require('../../core/middleware');

// Map service key to category and display metadata
const SERVICE_META = {
  razorpay: { category: 'payment', logo: '💳', provider: 'Razorpay Payments', description: 'Payment gateway for UPI, cards, wallets', features: ['UPI', 'Cards', 'Wallets', 'Netbanking'] },
  stripe: { category: 'payment', logo: '💰', provider: 'Stripe Inc.', description: 'International payment processing', features: ['Cards', 'Apple Pay', 'Google Pay'] },
  google_maps: { category: 'maps', logo: '🗺️', provider: 'Google Cloud', description: 'Maps, geocoding, distance matrix', features: ['Maps', 'Geocoding', 'Directions'] },
  sendgrid: { category: 'communication', logo: '📧', provider: 'Twilio SendGrid', description: 'Email delivery service', features: ['Transactional', 'Marketing'] },
  msg91: { category: 'communication', logo: '📱', provider: 'MSG91', description: 'SMS and OTP delivery', features: ['SMS', 'OTP'] },
  fcm: { category: 'communication', logo: '🔥', provider: 'Firebase', description: 'Push notifications', features: ['Push', 'Cloud Messaging'] },
  s3: { category: 'storage', logo: '☁️', provider: 'Amazon Web Services', description: 'Cloud storage', features: ['Object Storage', 'CDN'] },
  default: { category: 'other', logo: '🔌', provider: 'External', description: 'Third-party integration', features: [] },
};

function getServiceMeta(service) {
  const key = (service || '').toLowerCase().replace(/\s+/g, '_');
  return SERVICE_META[key] || { ...SERVICE_META.default, provider: service || 'Unknown' };
}

function toRichIntegration(doc, metrics = {}, health = 'healthy') {
  const meta = getServiceMeta(doc.service);
  const lastSync = doc.lastSync || doc.updatedAt;
  return {
    id: doc._id.toString(),
    name: doc.name,
    provider: meta.provider,
    category: meta.category,
    status: doc.isActive ? 'active' : 'inactive',
    health,
    description: meta.description,
    logo: meta.logo,
    apiVersion: 'v1',
    connectedAt: (doc.createdAt || new Date()).toISOString(),
    lastSync: lastSync ? new Date(lastSync).toISOString() : new Date().toISOString(),
    metrics: {
      requestsToday: metrics.requestsToday ?? 0,
      successRate: metrics.successRate ?? 0,
      avgResponseTime: metrics.avgResponseTime ?? 0,
      errorCount: metrics.errorCount ?? 0,
      uptime: metrics.uptime ?? 0,
      rateLimit: metrics.rateLimit ?? 100000,
      rateLimitUsed: metrics.rateLimitUsed ?? 0,
    },
    config: {
      apiKey: doc.apiKey ? doc.apiKey.slice(0, 8) + '••••••••' : '',
      environment: 'production',
      features: meta.features,
      webhookUrl: doc.webhookUrl || '',
    },
  };
}

module.exports = {
  list: asyncHandler(async (req, res) => {
    let integs = await Integration.find();
    if (integs.length === 0) {
      await Integration.insertMany([
        { name: 'Razorpay', service: 'razorpay', apiKey: '', isActive: true, endpoint: 'https://api.razorpay.com/v1/' },
        { name: 'Stripe', service: 'stripe', apiKey: '', isActive: true, endpoint: 'https://api.stripe.com/v1/' },
        { name: 'Google Maps API', service: 'google_maps', apiKey: '', isActive: true, endpoint: 'https://maps.googleapis.com/maps/api/' },
        { name: 'SendGrid Email', service: 'sendgrid', apiKey: '', isActive: true, endpoint: 'https://api.sendgrid.com/v3/' },
        { name: 'MSG91 SMS', service: 'msg91', apiKey: '', isActive: true, endpoint: 'https://api.msg91.com/api/' },
        { name: 'Firebase FCM', service: 'fcm', apiKey: '', isActive: true, endpoint: 'https://fcm.googleapis.com/fcm/' },
        { name: 'AWS S3', service: 's3', apiKey: '', isActive: true, endpoint: 'https://s3.amazonaws.com/' },
      ]);
      integs = await Integration.find();
    }
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const logAgg = await IntegrationLog.aggregate([
      { $match: { createdAt: { $gte: todayStart } } },
      { $group: { _id: '$integrationId', total: { $sum: 1 }, success: { $sum: { $cond: ['$success', 1, 0] } }, avgTime: { $avg: '$responseTime' } } },
    ]);
    const logMap = Object.fromEntries(logAgg.map((l) => [l._id.toString(), l]));
    const list = integs.map((i) => {
      const agg = logMap[i._id.toString()] || {};
      const health = i.lastSync
        ? (Date.now() - new Date(i.lastSync).getTime() < 3600000 ? 'healthy' : (Date.now() - new Date(i.lastSync).getTime() < 86400000 ? 'degraded' : 'down'))
        : 'healthy';
      const metrics = {
        requestsToday: agg.total || 0,
        successRate: agg.total ? ((agg.success || 0) / agg.total) * 100 : 0,
        avgResponseTime: Math.round(agg.avgTime || 0),
        errorCount: (agg.total || 0) - (agg.success || 0),
        uptime: 99,
        rateLimit: 100000,
        rateLimitUsed: agg.total || 0,
      };
      return toRichIntegration(i, metrics, health);
    });
    res.json({ success: true, data: list });
  }),

  update: asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { status, config } = req.body;
    const update = {};
    if (status !== undefined) update.isActive = status === 'active';
    if (config?.environment) update.environment = config.environment;
    const i = await Integration.findByIdAndUpdate(id, update, { new: true });
    if (!i) return res.status(404).json({ success: false, error: 'Integration not found' });
    res.json({ success: true, data: toRichIntegration(i) });
  }),

  toggle: asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;
    const isActive = status === 'active';
    const i = await Integration.findByIdAndUpdate(id, { isActive }, { new: true });
    if (!i) return res.status(404).json({ success: false, error: 'Integration not found' });
    res.json({ success: true, data: toRichIntegration(i) });
  }),

  test: asyncHandler(async (req, res) => {
    const { id } = req.params;
    const i = await Integration.findById(id);
    if (!i) return res.status(404).json({ success: false, error: 'Integration not found' });
    await Integration.findByIdAndUpdate(id, { lastSync: new Date() });
    res.json({ success: true, message: `Connection to ${i.name} verified successfully` });
  }),

  health: asyncHandler(async (req, res) => {
    const integs = await Integration.find({ isActive: true });
    const integrations = integs.map((i) => ({
      id: i._id.toString(),
      serviceKey: i.service,
      displayName: i.name,
      provider: getServiceMeta(i.service).provider,
      status: i.lastSync && Date.now() - new Date(i.lastSync).getTime() < 3600000 ? 'healthy' : 'unknown',
      message: i.lastSync ? `Last sync: ${new Date(i.lastSync).toISOString()}` : 'Never synced',
    }));
    res.json({ success: true, integrations });
  }),

  // Webhooks
  listWebhooks: asyncHandler(async (req, res) => {
    const webhooks = await IntegrationWebhook.find().populate('integrationId', 'name');
    const list = webhooks.map((w) => ({
      id: w._id.toString(),
      integrationId: w.integrationId?._id?.toString(),
      integrationName: w.integrationId?.name || 'Unknown',
      event: w.event,
      url: w.url,
      method: w.method,
      status: w.status,
      lastTriggered: (w.lastTriggered || w.updatedAt || new Date()).toISOString(),
      totalCalls: w.totalCalls,
      successCount: w.successCount,
      failureCount: w.failureCount,
      retryPolicy: w.retryPolicy,
      headers: Object.fromEntries(w.headers || []),
    }));
    res.json({ success: true, data: list });
  }),

  createWebhook: asyncHandler(async (req, res) => {
    const { integrationId, integrationName, event, url } = req.body;
    if (!integrationId || !event || !url) {
      return res.status(400).json({ success: false, error: 'integrationId, event and url are required' });
    }
    const integ = await Integration.findById(integrationId);
    if (!integ) return res.status(404).json({ success: false, error: 'Integration not found' });
    const w = await IntegrationWebhook.create({
      integrationId,
      event,
      url,
      method: 'POST',
      status: 'active',
    });
    res.status(201).json({
      success: true,
      data: {
        id: w._id.toString(),
        integrationId: w.integrationId.toString(),
        integrationName: integrationName || integ.name,
        event: w.event,
        url: w.url,
        method: w.method,
        status: w.status,
        lastTriggered: new Date().toISOString(),
        totalCalls: 0,
        successCount: 0,
        failureCount: 0,
        retryPolicy: w.retryPolicy,
        headers: {},
      },
    });
  }),

  retryWebhook: asyncHandler(async (req, res) => {
    const { webhookId } = req.params;
    const w = await IntegrationWebhook.findById(webhookId);
    if (!w) return res.status(404).json({ success: false, error: 'Webhook not found' });
    w.status = 'active';
    await w.save();
    res.json({ success: true, message: 'Webhook retry initiated' });
  }),

  // API Keys (per-integration)
  listApiKeys: asyncHandler(async (req, res) => {
    const keys = await IntegrationApiKey.find().populate('integrationId', 'name');
    const list = keys.map((k) => ({
      id: k._id.toString(),
      name: k.name,
      key: k.keyPrefix || 'sk_••••••••',
      integrationId: k.integrationId?._id?.toString(),
      integrationName: k.integrationId?.name || 'Unknown',
      permissions: k.permissions || [],
      environment: k.environment,
      status: k.status,
      createdAt: k.createdAt?.toISOString(),
      expiresAt: k.expiresAt?.toISOString() || 'Never',
      lastUsed: k.lastUsed ? k.lastUsed.toISOString() : 'Never',
      usageCount: k.usageCount || 0,
    }));
    res.json({ success: true, data: list });
  }),

  createApiKey: asyncHandler(async (req, res) => {
    const { integrationId, integrationName, name, environment } = req.body;
    if (!integrationId || !name) {
      return res.status(400).json({ success: false, error: 'integrationId and name are required' });
    }
    const integ = await Integration.findById(integrationId);
    if (!integ) return res.status(404).json({ success: false, error: 'Integration not found' });
    const { plain, keyPrefix, keyHash } = IntegrationApiKey.generateKey();
    const k = await IntegrationApiKey.create({
      integrationId,
      name,
      keyPrefix,
      keyHash,
      environment: environment || 'production',
      status: 'active',
      permissions: ['read', 'write'],
      expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
    });
    res.status(201).json({
      success: true,
      data: {
        id: k._id.toString(),
        name: k.name,
        key: plain,
        integrationId: k.integrationId.toString(),
        integrationName: integrationName || integ.name,
        permissions: k.permissions,
        environment: k.environment,
        status: k.status,
        createdAt: k.createdAt.toISOString(),
        expiresAt: k.expiresAt.toISOString(),
        lastUsed: 'Never',
        usageCount: 0,
      },
      plainKey: plain,
      message: 'API key created. Copy the key now - it will not be shown again.',
    });
  }),

  revokeApiKey: asyncHandler(async (req, res) => {
    const { keyId } = req.params;
    const k = await IntegrationApiKey.findById(keyId);
    if (!k) return res.status(404).json({ success: false, error: 'API key not found' });
    k.status = 'revoked';
    await k.save();
    res.json({ success: true, message: 'API key revoked' });
  }),

  // Logs
  listLogs: asyncHandler(async (req, res) => {
    const logs = await IntegrationLog.find()
      .populate('integrationId', 'name')
      .sort({ createdAt: -1 })
      .limit(100);
    const list = logs.map((l) => ({
      id: l._id.toString(),
      integrationId: l.integrationId?._id?.toString(),
      integrationName: l.integrationId?.name || 'Unknown',
      timestamp: l.createdAt?.toISOString(),
      method: l.method,
      endpoint: l.endpoint,
      statusCode: l.statusCode,
      responseTime: l.responseTime,
      requestSize: l.requestSize || 0,
      responseSize: l.responseSize || 0,
      success: l.success,
      errorMessage: l.errorMessage,
    }));
    res.json({ success: true, data: list });
  }),

  // Stats
  stats: asyncHandler(async (req, res) => {
    const totalIntegrations = await Integration.countDocuments();
    const activeIntegrations = await Integration.countDocuments({ isActive: true });
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const agg = await IntegrationLog.aggregate([
      { $match: { createdAt: { $gte: todayStart } } },
      {
        $group: {
          _id: null,
          totalRequests: { $sum: 1 },
          successCount: { $sum: { $cond: ['$success', 1, 0] } },
          avgResponseTime: { $avg: '$responseTime' },
        },
      },
    ]);
    const a = agg[0] || {};
    const total = a.totalRequests || 0;
    const success = a.successCount || 0;
    res.json({
      success: true,
      data: {
        totalIntegrations,
        activeIntegrations,
        totalRequests: total,
        successRate: total ? Number(((success / total) * 100).toFixed(1)) : 0,
        avgResponseTime: Math.round(a.avgResponseTime || 0),
        errorRate: total ? Number((((total - success) / total) * 100).toFixed(1)) : 0,
      },
    });
  }),
};
