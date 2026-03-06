const { FaqItem } = require('../../models/FaqItem');

exports.list = async (req, res) => {
  try {
    const { category, isActive } = req.query;
    const filter = {};
    if (category) filter.category = category;
    if (isActive !== undefined) filter.isActive = isActive === 'true';
    const items = await FaqItem.find(filter).sort({ order: 1, createdAt: 1 }).lean();
    res.json({ success: true, data: items });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

exports.getById = async (req, res) => {
  try {
    const item = await FaqItem.findById(req.params.id).lean();
    if (!item) return res.status(404).json({ success: false, error: 'FAQ item not found' });
    res.json({ success: true, data: item });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

exports.create = async (req, res) => {
  try {
    const { question, answer, order, category, isActive } = req.body;
    if (!question || !answer) {
      return res.status(400).json({ success: false, error: 'question and answer are required' });
    }
    const item = await FaqItem.create({
      question,
      answer,
      order: order ?? 0,
      category: category ?? '',
      isActive: isActive !== false,
    });
    res.status(201).json({ success: true, data: item });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

exports.update = async (req, res) => {
  try {
    const body = { ...req.body };
    delete body._id;
    const updated = await FaqItem.findByIdAndUpdate(req.params.id, body, { new: true, runValidators: true }).lean();
    if (!updated) return res.status(404).json({ success: false, error: 'FAQ item not found' });
    res.json({ success: true, data: updated });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

exports.delete = async (req, res) => {
  try {
    const deleted = await FaqItem.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ success: false, error: 'FAQ item not found' });
    res.json({ success: true, message: 'FAQ item deleted' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};
