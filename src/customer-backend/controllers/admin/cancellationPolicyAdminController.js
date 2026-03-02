const { CancellationPolicy } = require('../../models/CancellationPolicy');

exports.list = async (req, res) => {
  try {
    const items = await CancellationPolicy.find().sort({ createdAt: -1 }).lean();
    res.json({ success: true, data: items });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

exports.getById = async (req, res) => {
  try {
    const item = await CancellationPolicy.findById(req.params.id).lean();
    if (!item) return res.status(404).json({ success: false, error: 'Policy not found' });
    res.json({ success: true, data: item });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

exports.create = async (req, res) => {
  try {
    const created = await CancellationPolicy.create(req.body);
    res.status(201).json({ success: true, data: created });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

exports.update = async (req, res) => {
  try {
    const body = { ...req.body };
    delete body._id;
    const updated = await CancellationPolicy.findByIdAndUpdate(req.params.id, body, { new: true, runValidators: true }).lean();
    if (!updated) return res.status(404).json({ success: false, error: 'Policy not found' });
    res.json({ success: true, data: updated });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

exports.remove = async (req, res) => {
  try {
    const deleted = await CancellationPolicy.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ success: false, error: 'Policy not found' });
    res.json({ success: true, message: 'Policy deleted' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};
