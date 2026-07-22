const { AppConfig, DEFAULT_APP_CONFIG } = require('../../models/AppConfig');
const {
  applyEffectiveCheckoutPricing,
  invalidateDeliveryPricingCache,
} = require('../../services/deliveryPricingConfig');

/** Ensure support aliases + optional fields are always present for clients. */
function normalizePublicSupport(support = {}) {
  const defaults = DEFAULT_APP_CONFIG.support || {};
  const phone = support.supportPhone || support.contactPhone || defaults.supportPhone;
  const email = support.supportEmail || support.contactEmail || defaults.supportEmail;
  return {
    ...defaults,
    ...support,
    contactPhone: phone,
    contactEmail: email,
    supportPhone: phone,
    supportEmail: email,
    whatsappNumber: support.whatsappNumber || defaults.whatsappNumber,
    workingHours: support.workingHours || defaults.workingHours,
    responseTime: support.responseTime || defaults.responseTime,
    liveChatEnabled:
      typeof support.liveChatEnabled === 'boolean'
        ? support.liveChatEnabled
        : defaults.liveChatEnabled !== false,
  };
}

function normalizePublicConfig(config) {
  const base = config && typeof config === 'object' ? { ...config } : { ...DEFAULT_APP_CONFIG };
  base.support = normalizePublicSupport(base.support || {});
  if (!Array.isArray(base.supportCategories) || base.supportCategories.length === 0) {
    base.supportCategories = DEFAULT_APP_CONFIG.supportCategories;
  }
  base.images = {
    ...(DEFAULT_APP_CONFIG.images || {}),
    ...(base.images || {}),
  };
  base.wallet = {
    ...(DEFAULT_APP_CONFIG.wallet || {}),
    ...(base.wallet || {}),
  };
  if (Array.isArray(base.paymentMethods)) {
    base.paymentMethods = base.paymentMethods.map((pm) => ({
      ...pm,
      imageUrl: pm.imageUrl || '',
    }));
  }
  if (Array.isArray(base.supportCategories)) {
    base.supportCategories = base.supportCategories.map((cat) => ({
      ...cat,
      imageUrl: cat.imageUrl || '',
    }));
  }
  return base;
}

exports.getConfig = async (req, res) => {
  try {
    let config = await AppConfig.findOne({ key: 'default' }).lean();
    if (!config) {
      config = await AppConfig.create(DEFAULT_APP_CONFIG);
      config = config.toObject();
    }
    res.json({ success: true, data: normalizePublicConfig(config) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

exports.updateConfig = async (req, res) => {
  try {
    const updates = { ...req.body };
    delete updates._id;
    delete updates.key;
    delete updates.__v;

    if (updates.support) {
      updates.support = normalizePublicSupport(updates.support);
    }

    let config = await AppConfig.findOneAndUpdate(
      { key: 'default' },
      { $set: updates },
      { new: true, upsert: true, runValidators: true }
    ).lean();

    invalidateDeliveryPricingCache();
    res.json({ success: true, data: normalizePublicConfig(config) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

exports.updateSection = async (req, res) => {
  try {
    const { section } = req.params;
    const allowedSections = [
      'branding', 'otp', 'checkout', 'paymentMethods', 'featureFlags',
      'appVersion', 'maintenance', 'supportCategories', 'support', 'payment',
      'images', 'search', 'notifications', 'locationTags', 'wallet', 'catalog',
    ];
    if (!allowedSections.includes(section)) {
      return res.status(400).json({ success: false, error: `Invalid section: ${section}` });
    }

    let sectionData = req.body[section] ?? req.body;
    if (section === 'support') {
      sectionData = normalizePublicSupport(sectionData);
    }

    const update = { [section]: sectionData };
    const config = await AppConfig.findOneAndUpdate(
      { key: 'default' },
      { $set: update },
      { new: true, upsert: true, runValidators: true }
    ).lean();

    if (section === 'checkout') invalidateDeliveryPricingCache();
    res.json({ success: true, data: normalizePublicConfig(config) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

exports.resetConfig = async (req, res) => {
  try {
    await AppConfig.deleteOne({ key: 'default' });
    const config = await AppConfig.create(DEFAULT_APP_CONFIG);
    invalidateDeliveryPricingCache();
    res.json({ success: true, data: normalizePublicConfig(config.toObject()) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

exports.getPublicConfig = async (req, res) => {
  try {
    let config = await AppConfig.findOne({ key: 'default' }).lean();
    if (!config) {
      config = DEFAULT_APP_CONFIG;
    }
    // Clients must see the delivery pricing the engine actually bills with,
    // so guest carts and logged-in carts show identical fees.
    const data = applyEffectiveCheckoutPricing(normalizePublicConfig(config));
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

/** Upload a CMS illustration (empty states, OOS, wallet, etc.) and return its public URL. */
exports.uploadCmsImage = async (req, res) => {
  try {
    const { image: base64Data, folder } = req.body || {};
    if (!base64Data || typeof base64Data !== 'string') {
      return res.status(400).json({ success: false, message: 'image (base64) is required' });
    }
    const { uploadCmsIllustrationImage } = require('../../../utils/s3Upload');
    const safeFolder =
      typeof folder === 'string' && /^[a-z0-9/_-]{1,64}$/i.test(folder.trim())
        ? folder.trim()
        : 'cms-images';
    const url = await uploadCmsIllustrationImage(base64Data, safeFolder);
    res.json({ success: true, data: { url } });
  } catch (err) {
    console.error('[uploadCmsImage]', err);
    res.status(500).json({ success: false, message: err.message || 'Failed to upload image' });
  }
};

exports.normalizePublicConfig = normalizePublicConfig;
exports.normalizePublicSupport = normalizePublicSupport;
