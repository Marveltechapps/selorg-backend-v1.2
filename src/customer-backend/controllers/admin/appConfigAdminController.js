const { AppConfig, DEFAULT_APP_CONFIG } = require('../../models/AppConfig');

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
      'images', 'search', 'notifications', 'locationTags',
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

    res.json({ success: true, data: normalizePublicConfig(config) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

exports.resetConfig = async (req, res) => {
  try {
    await AppConfig.deleteOne({ key: 'default' });
    const config = await AppConfig.create(DEFAULT_APP_CONFIG);
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
    res.json({ success: true, data: normalizePublicConfig(config) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

exports.normalizePublicConfig = normalizePublicConfig;
exports.normalizePublicSupport = normalizePublicSupport;
