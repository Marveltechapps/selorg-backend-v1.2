const { LegalDocument } = require('../../models/LegalDocument');
const { LegalConfig } = require('../../models/LegalConfig');

exports.listDocuments = async (req, res) => {
  try {
    const { type } = req.query;
    const filter = {};
    if (type) filter.type = type;
    const items = await LegalDocument.find(filter).sort({ type: 1, createdAt: -1 }).lean();
    res.json({ success: true, data: items });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

exports.getDocument = async (req, res) => {
  try {
    const doc = await LegalDocument.findById(req.params.id).lean();
    if (!doc) return res.status(404).json({ success: false, error: 'Document not found' });
    res.json({ success: true, data: doc });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

exports.createDocument = async (req, res) => {
  try {
    const { type, version, title, effectiveDate, lastUpdated, contentFormat, content, isCurrent } = req.body;
    if (!type || !version || !title || !content) {
      return res.status(400).json({ success: false, error: 'type, version, title, and content are required' });
    }
    if (isCurrent) {
      await LegalDocument.updateMany({ type, isCurrent: true }, { isCurrent: false });
    }
    const doc = await LegalDocument.create({
      type,
      version,
      title,
      effectiveDate: effectiveDate || new Date().toISOString(),
      lastUpdated: lastUpdated || new Date().toISOString(),
      contentFormat: contentFormat || 'plain',
      content,
      isCurrent: isCurrent !== false,
    });
    res.status(201).json({ success: true, data: doc });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ success: false, error: 'Document with this type and version already exists' });
    }
    res.status(500).json({ success: false, error: err.message });
  }
};

exports.updateDocument = async (req, res) => {
  try {
    const body = { ...req.body };
    delete body._id;
    body.lastUpdated = new Date().toISOString();
    if (body.isCurrent) {
      const existing = await LegalDocument.findById(req.params.id).lean();
      if (existing) {
        await LegalDocument.updateMany({ type: existing.type, isCurrent: true, _id: { $ne: req.params.id } }, { isCurrent: false });
      }
    }
    const updated = await LegalDocument.findByIdAndUpdate(req.params.id, body, { new: true, runValidators: true }).lean();
    if (!updated) return res.status(404).json({ success: false, error: 'Document not found' });
    res.json({ success: true, data: updated });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

exports.deleteDocument = async (req, res) => {
  try {
    const deleted = await LegalDocument.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ success: false, error: 'Document not found' });
    res.json({ success: true, message: 'Document deleted' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

exports.setCurrentDocument = async (req, res) => {
  try {
    const doc = await LegalDocument.findById(req.params.id);
    if (!doc) return res.status(404).json({ success: false, error: 'Document not found' });
    await LegalDocument.updateMany({ type: doc.type, isCurrent: true }, { isCurrent: false });
    doc.isCurrent = true;
    await doc.save();
    res.json({ success: true, data: doc.toObject() });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

exports.getConfig = async (req, res) => {
  try {
    let config = await LegalConfig.findOne({ key: 'default' }).lean();
    if (!config) {
      config = await LegalConfig.create({ key: 'default' });
      config = config.toObject();
    }
    res.json({ success: true, data: config });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

exports.updateConfig = async (req, res) => {
  try {
    const body = { ...req.body };
    delete body._id;
    delete body.key;
    const config = await LegalConfig.findOneAndUpdate(
      { key: 'default' },
      { $set: body },
      { new: true, upsert: true, runValidators: true }
    ).lean();
    res.json({ success: true, data: config });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};
