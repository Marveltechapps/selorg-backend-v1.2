const { AppConfig, DEFAULT_APP_CONFIG } = require('../../models/AppConfig');

exports.getConfig = async (req, res) => {
  try {
    let config = await AppConfig.findOne({ key: 'default' }).lean();
    if (!config) {
      config = await AppConfig.create(DEFAULT_APP_CONFIG);
      config = config.toObject();
    }
    res.json({ success: true, data: config });
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

    let config = await AppConfig.findOneAndUpdate(
      { key: 'default' },
      { $set: updates },
      { new: true, upsert: true, runValidators: true }
    ).lean();

    res.json({ success: true, data: config });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

exports.updateSection = async (req, res) => {
  try {
    const { section } = req.params;
    const allowedSections = [
      'branding', 'otp', 'checkout', 'paymentMethods', 'featureFlags',
      'appVersion', 'maintenance', 'supportCategories', 'search',
      'notifications', 'locationTags',
    ];
    if (!allowedSections.includes(section)) {
      return res.status(400).json({ success: false, error: `Invalid section: ${section}` });
    }

    const update = { [section]: req.body[section] ?? req.body };
    const config = await AppConfig.findOneAndUpdate(
      { key: 'default' },
      { $set: update },
      { new: true, upsert: true, runValidators: true }
    ).lean();

    res.json({ success: true, data: config });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

exports.resetConfig = async (req, res) => {
  try {
    await AppConfig.deleteOne({ key: 'default' });
    const config = await AppConfig.create(DEFAULT_APP_CONFIG);
    res.json({ success: true, data: config.toObject() });
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
    res.json({ success: true, data: config });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};
