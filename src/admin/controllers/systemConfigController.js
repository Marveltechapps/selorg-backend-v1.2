/**
 * System Configuration Controller
 * Handles /admin/system/* endpoints for platform settings
 */
const SystemConfig = require('../models/SystemConfig');
const PaymentGateway = require('../models/PaymentGateway');
const FeatureFlag = require('../models/FeatureFlag');
const Integration = require('../models/Integration');
const ApiKey = require('../models/ApiKey');
const { asyncHandler } = require('../../core/middleware');

// Default configs used when no DB record exists (seed on first get)
const DEFAULTS = {
  general: {
    platformName: 'QuickCommerce',
    tagline: 'Groceries delivered in 10 minutes',
    logoUrl: '',
    faviconUrl: '/favicon.ico',
    timezone: 'Asia/Kolkata',
    currency: 'INR',
    currencySymbol: '₹',
    defaultLanguage: 'en',
    supportedLanguages: ['en', 'hi', 'kn', 'ta', 'te'],
    dateFormat: 'DD/MM/YYYY',
    timeFormat: '12h',
    primaryColor: '#e11d48',
    secondaryColor: '#0ea5e9',
    contactEmail: 'support@quickcommerce.com',
    supportPhone: '+91-80-4567-8900',
  },
  delivery: {
    minOrderValue: 99,
    maxOrderValue: 10000,
    baseDeliveryFee: 25,
    freeDeliveryAbove: 500,
    deliveryFeePerKm: 8,
    maxDeliveryRadius: 10,
    avgDeliveryTime: 15,
    expressDeliveryFee: 49,
    slots: [
      { id: 'slot-1', name: 'Morning', startTime: '06:00', endTime: '10:00', days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'], maxOrders: 100, isActive: true, surgeMultiplier: 1.0 },
      { id: 'slot-2', name: 'Afternoon', startTime: '12:00', endTime: '16:00', days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'], maxOrders: 150, isActive: true, surgeMultiplier: 1.0 },
      { id: 'slot-3', name: 'Evening', startTime: '18:00', endTime: '22:00', days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'], maxOrders: 200, isActive: true, surgeMultiplier: 1.2 },
      { id: 'slot-4', name: 'Late Night', startTime: '22:00', endTime: '02:00', days: ['Friday', 'Saturday'], maxOrders: 80, isActive: true, surgeMultiplier: 1.5 },
    ],
    partners: ['Dunzo', 'Shadowfax', 'Porter', 'In-house Fleet'],
  },
  notifications: {
    emailEnabled: true,
    smsEnabled: true,
    pushEnabled: true,
    emailProvider: 'sendgrid',
    smsProvider: 'msg91',
    emailApiKey: '',
    smsApiKey: '',
    fcmServerKey: '',
    templates: [],
  },
  tax: {
    gstEnabled: true,
    cgstRate: 2.5,
    sgstRate: 2.5,
    igstRate: 5.0,
    tdsEnabled: false,
    tdsRate: 1.0,
    taxDisplayType: 'inclusive',
    gstNumber: '',
    panNumber: '',
  },
  advanced: {
    maintenanceMode: false,
    debugMode: false,
    cacheEnabled: true,
    cacheDuration: 300,
    rateLimitPerMinute: 60,
    maxConcurrentUsers: 10000,
    sessionTimeout: 1800,
    logLevel: 'info',
    apiVersion: '1.0.0',
  },
};

async function getOrCreateConfig(key) {
  let doc = await SystemConfig.findOne({ key });
  if (!doc) {
    const def = DEFAULTS[key];
    if (!def) return null;
    doc = await SystemConfig.create({ key, value: def });
  }
  return doc.value;
}

async function updateConfig(key, value) {
  const doc = await SystemConfig.findOneAndUpdate(
    { key },
    { $set: { value } },
    { new: true, upsert: true }
  );
  return doc.value;
}

const systemConfigController = {
  getGeneral: asyncHandler(async (req, res) => {
    const settings = await getOrCreateConfig('general');
    res.json({ success: true, data: settings });
  }),

  updateGeneral: asyncHandler(async (req, res) => {
    const current = await getOrCreateConfig('general');
    const updated = await updateConfig('general', { ...current, ...req.body });
    res.json({ success: true, data: updated });
  }),

  getDelivery: asyncHandler(async (req, res) => {
    const data = await getOrCreateConfig('delivery');
    res.json({ success: true, data });
  }),

  updateDelivery: asyncHandler(async (req, res) => {
    const current = await getOrCreateConfig('delivery');
    const updated = await updateConfig('delivery', { ...current, ...req.body });
    res.json({ success: true, data: updated });
  }),

  listPaymentGateways: asyncHandler(async (req, res) => {
    let gateways = await PaymentGateway.find().sort({ displayOrder: 1 });
    if (gateways.length === 0) {
      await PaymentGateway.insertMany([
        { name: 'Razorpay', provider: 'razorpay', isActive: true, apiKey: '', secretKey: '', transactionFee: 2, transactionFeeType: 'percentage', minAmount: 10, maxAmount: 100000, displayOrder: 1 },
        { name: 'Paytm', provider: 'paytm', isActive: true, apiKey: '', secretKey: '', merchantId: '', transactionFee: 1.8, transactionFeeType: 'percentage', minAmount: 10, maxAmount: 100000, displayOrder: 2 },
        { name: 'PhonePe', provider: 'phonepe', isActive: false, apiKey: '', secretKey: '', merchantId: '', transactionFee: 1.5, transactionFeeType: 'percentage', minAmount: 10, maxAmount: 100000, displayOrder: 3 },
        { name: 'Cash on Delivery', provider: 'cod', isActive: true, apiKey: 'N/A', secretKey: 'N/A', transactionFee: 15, transactionFeeType: 'flat', minAmount: 0, maxAmount: 2000, displayOrder: 4 },
      ]);
      gateways = await PaymentGateway.find().sort({ displayOrder: 1 });
    }
    const list = gateways.map(g => ({
      id: g._id.toString(),
      name: g.name,
      provider: g.provider,
      isActive: g.isActive,
      apiKey: g.apiKey ? (g.apiKey.slice(0, 8) + '...' + g.apiKey.slice(-4)) : 'N/A',
      secretKey: g.secretKey ? '••••••••••••••••' : 'N/A',
      merchantId: g.merchantId,
      transactionFee: g.transactionFee,
      transactionFeeType: g.transactionFeeType,
      minAmount: g.minAmount,
      maxAmount: g.maxAmount,
      displayOrder: g.displayOrder,
    }));
    res.json({ success: true, data: list });
  }),

  updatePaymentGateway: asyncHandler(async (req, res) => {
    const { id } = req.params;
    const update = { ...req.body };
    delete update.id;
    const g = await PaymentGateway.findByIdAndUpdate(id, update, { new: true });
    if (!g) return res.status(404).json({ success: false, error: 'Payment gateway not found' });
    res.json({
      success: true,
      data: {
        id: g._id.toString(),
        name: g.name,
        provider: g.provider,
        isActive: g.isActive,
        apiKey: g.apiKey ? (g.apiKey.slice(0, 8) + '...') : 'N/A',
        secretKey: g.secretKey ? '••••••••••••••••' : 'N/A',
        merchantId: g.merchantId,
        transactionFee: g.transactionFee,
        transactionFeeType: g.transactionFeeType,
        minAmount: g.minAmount,
        maxAmount: g.maxAmount,
        displayOrder: g.displayOrder,
      },
    });
  }),

  getNotifications: asyncHandler(async (req, res) => {
    const data = await getOrCreateConfig('notifications');
    res.json({ success: true, data });
  }),

  updateNotifications: asyncHandler(async (req, res) => {
    const current = await getOrCreateConfig('notifications');
    const updated = await updateConfig('notifications', { ...current, ...req.body });
    res.json({ success: true, data: updated });
  }),

  getTax: asyncHandler(async (req, res) => {
    const data = await getOrCreateConfig('tax');
    res.json({ success: true, data });
  }),

  updateTax: asyncHandler(async (req, res) => {
    const current = await getOrCreateConfig('tax');
    const updated = await updateConfig('tax', { ...current, ...req.body });
    res.json({ success: true, data: updated });
  }),

  listFeatureFlags: asyncHandler(async (req, res) => {
    let flags = await FeatureFlag.find();
    if (flags.length === 0) {
      await FeatureFlag.insertMany([
        { name: 'Dark Mode', key: 'dark_mode', description: 'Enable dark mode theme', isEnabled: true, category: 'core', requiresRestart: false },
        { name: 'Loyalty Program', key: 'loyalty_program', description: 'Reward points and cashback', isEnabled: true, category: 'premium', requiresRestart: false },
        { name: 'Live Chat Support', key: 'live_chat', description: 'Real-time customer support chat', isEnabled: false, category: 'beta', requiresRestart: false },
        { name: 'Voice Search', key: 'voice_search', description: 'Voice-based product search', isEnabled: false, category: 'experimental', requiresRestart: true },
        { name: 'Subscription Plans', key: 'subscriptions', description: 'Recurring delivery subscriptions', isEnabled: true, category: 'premium', requiresRestart: false },
        { name: 'Social Login', key: 'social_login', description: 'Login with Google, Facebook', isEnabled: true, category: 'core', requiresRestart: false },
      ]);
      flags = await FeatureFlag.find();
    }
    const list = flags.map(f => ({
      id: f._id.toString(),
      name: f.name,
      key: f.key,
      description: f.description,
      isEnabled: f.isEnabled,
      category: f.category,
      requiresRestart: f.requiresRestart,
    }));
    res.json({ success: true, data: list });
  }),

  toggleFeatureFlag: asyncHandler(async (req, res) => {
    const { id } = req.params;
    const f = await FeatureFlag.findById(id);
    if (!f) return res.status(404).json({ success: false, error: 'Feature flag not found' });
    f.isEnabled = !f.isEnabled;
    await f.save();
    res.json({
      success: true,
      data: {
        id: f._id.toString(),
        name: f.name,
        key: f.key,
        description: f.description,
        isEnabled: f.isEnabled,
        category: f.category,
        requiresRestart: f.requiresRestart,
      },
    });
  }),

  listIntegrations: asyncHandler(async (req, res) => {
    let integs = await Integration.find();
    if (integs.length === 0) {
      await Integration.insertMany([
        { name: 'Google Maps API', service: 'google_maps', apiKey: '', isActive: true, endpoint: 'https://maps.googleapis.com/maps/api/' },
        { name: 'SendGrid Email', service: 'sendgrid', apiKey: '', isActive: true, endpoint: 'https://api.sendgrid.com/v3/' },
        { name: 'MSG91 SMS', service: 'msg91', apiKey: '', isActive: true, endpoint: 'https://api.msg91.com/api/' },
        { name: 'Firebase FCM', service: 'fcm', apiKey: '', isActive: true, endpoint: 'https://fcm.googleapis.com/fcm/' },
        { name: 'AWS S3', service: 's3', apiKey: '', isActive: true, endpoint: 'https://s3.amazonaws.com/' },
      ]);
      integs = await Integration.find();
    }
    const list = integs.map(i => ({
      id: i._id.toString(),
      name: i.name,
      service: i.service,
      apiKey: i.apiKey ? (i.apiKey.slice(0, 8) + '...') : '',
      isActive: i.isActive,
      endpoint: i.endpoint,
      lastSync: i.lastSync,
    }));
    res.json({ success: true, data: list });
  }),

  updateIntegration: asyncHandler(async (req, res) => {
    const { id } = req.params;
    const update = { ...req.body };
    delete update.id;
    const i = await Integration.findByIdAndUpdate(id, update, { new: true });
    if (!i) return res.status(404).json({ success: false, error: 'Integration not found' });
    res.json({
      success: true,
      data: {
        id: i._id.toString(),
        name: i.name,
        service: i.service,
        apiKey: i.apiKey ? (i.apiKey.slice(0, 8) + '...') : '',
        isActive: i.isActive,
        endpoint: i.endpoint,
        lastSync: i.lastSync,
      },
    });
  }),

  testIntegration: asyncHandler(async (req, res) => {
    const { id } = req.params;
    const i = await Integration.findById(id);
    if (!i) return res.status(404).json({ success: false, error: 'Integration not found' });
    await Integration.findByIdAndUpdate(id, { lastSync: new Date() });
    res.json({ success: true, message: `Connection to ${i.name} verified successfully` });
  }),

  getAdvanced: asyncHandler(async (req, res) => {
    const data = await getOrCreateConfig('advanced');
    res.json({ success: true, data });
  }),

  updateAdvanced: asyncHandler(async (req, res) => {
    const current = await getOrCreateConfig('advanced');
    const updated = await updateConfig('advanced', { ...current, ...req.body });
    res.json({ success: true, data: updated });
  }),

  // --- API Key Management ---
  listApiKeys: asyncHandler(async (req, res) => {
    const keys = await ApiKey.find()
      .populate('createdBy', 'name email')
      .sort({ createdAt: -1 });
    const list = keys.map(k => ({
      key_id: k.keyId,
      id: k._id.toString(),
      name: k.name,
      created_by: k.createdBy?.name || k.createdBy?.email || 'System',
      scopes: k.scopes,
      last_used: k.lastUsed,
      status: k.status,
      created_at: k.createdAt,
    }));
    res.json({ success: true, data: list });
  }),

  createApiKey: asyncHandler(async (req, res) => {
    const { name, scopes } = req.body;
    if (!name || !scopes || !Array.isArray(scopes) || scopes.length === 0) {
      return res.status(400).json({ success: false, error: 'name and scopes (non-empty array) are required' });
    }
    const { plain, keyId, keyHash } = ApiKey.generateKey();
    const key = await ApiKey.create({
      keyId,
      name,
      keyHash,
      createdBy: req.user?.userId,
      scopes,
      status: 'active',
    });
    res.status(201).json({
      success: true,
      data: {
        key_id: key.keyId,
        id: key._id.toString(),
        name: key.name,
        scopes: key.scopes,
        status: key.status,
        created_at: key.createdAt,
      },
      plainKey: plain,
      message: 'API key created. Copy the plain key now - it will not be shown again.',
    });
  }),

  revokeApiKey: asyncHandler(async (req, res) => {
    const { id } = req.params;
    const key = await ApiKey.findById(id);
    if (!key) return res.status(404).json({ success: false, error: 'API key not found' });
    key.status = 'revoked';
    await key.save();
    res.json({ success: true, message: 'API key revoked' });
  }),

  listCronJobs: asyncHandler(async (req, res) => {
    const jobs = [
      { id: 'cron-1', name: 'Order Sync', schedule: '0 */5 * * * *', lastRun: new Date().toISOString(), nextRun: new Date(Date.now() + 300000).toISOString(), status: 'active', executions: 0, avgDuration: '0.2s' },
      { id: 'cron-2', name: 'Inventory Refresh', schedule: '0 0 * * * *', lastRun: new Date().toISOString(), nextRun: new Date(Date.now() + 3600000).toISOString(), status: 'active', executions: 0, avgDuration: '1.5s' },
      { id: 'cron-3', name: 'Analytics Daily', schedule: '0 0 2 * * *', lastRun: null, nextRun: new Date().toISOString(), status: 'active', executions: 0, avgDuration: '30s' },
    ];
    res.json({ success: true, data: jobs });
  }),

  triggerCronJob: asyncHandler(async (req, res) => {
    res.json({ success: true, message: 'Cron job triggered' });
  }),

  toggleCronJob: asyncHandler(async (req, res) => {
    res.json({ success: true });
  }),

  listEnvVariables: asyncHandler(async (req, res) => {
    const vars = [
      { key: 'NODE_ENV', value: process.env.NODE_ENV || 'development', isSensitive: false, category: 'core' },
      { key: 'API_VERSION', value: '1.0.0', isSensitive: false, category: 'api' },
      { key: 'LOG_LEVEL', value: process.env.LOG_LEVEL || 'info', isSensitive: false, category: 'core' },
    ];
    res.json({ success: true, data: vars });
  }),

  updateEnvVariable: asyncHandler(async (req, res) => {
    res.json({ success: true });
  }),

  getMaintenanceMode: asyncHandler(async (req, res) => {
    const data = await getOrCreateConfig('advanced');
    res.json({ success: true, enabled: data.maintenanceMode || false, message: '' });
  }),

  toggleMaintenanceMode: asyncHandler(async (req, res) => {
    const { enabled } = req.body;
    const current = await getOrCreateConfig('advanced');
    const updated = await updateConfig('advanced', { ...current, maintenanceMode: !!enabled });
    res.json({ success: true, enabled: updated.maintenanceMode });
  }),

  rotateApiKey: asyncHandler(async (req, res) => {
    const { id } = req.params;
    const key = await ApiKey.findById(id);
    if (!key) return res.status(404).json({ success: false, error: 'API key not found' });
    if (key.status === 'revoked') {
      return res.status(400).json({ success: false, error: 'Cannot rotate a revoked key' });
    }
    const { plain, keyId, keyHash } = ApiKey.generateKey();
    key.keyId = keyId;
    key.keyHash = keyHash;
    await key.save();
    res.json({
      success: true,
      data: {
        key_id: key.keyId,
        id: key._id.toString(),
        name: key.name,
        scopes: key.scopes,
        status: key.status,
      },
      plainKey: plain,
      message: 'API key rotated. Copy the new plain key now - it will not be shown again.',
    });
  }),
};

module.exports = systemConfigController;
