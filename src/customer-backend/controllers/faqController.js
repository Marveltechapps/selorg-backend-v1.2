const { FaqItem } = require('../models/FaqItem');

/** Public API - returns active FAQ items for customer app */
exports.list = async (req, res) => {
  try {
    const items = await FaqItem.find({ isActive: true })
      .sort({ order: 1, createdAt: 1 })
      .select('question answer order category')
      .lean();
    res.json({ success: true, data: items });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};
