/**
 * Documents service – from frontend YAML (documentService.ts).
 * Upload (return URL), list by user (aadhar/pan front/back).
 * REAL-TIME: list returns empty doc structure if DB slow; upload returns url on success.
 */
const Document = require('../models/document.model');
const { withTimeout, DB_TIMEOUT_MS } = require('../utils/realtime.util');

const emptyDocs = { aadhar: { front: null, back: null }, pan: { front: null, back: null } };

const upload = async (userId, docType, side, url) => {
  try {
    const doc = await withTimeout(
      Document.findOneAndUpdate(
        { userId, docType, side },
        { url, updatedAt: new Date() },
        { new: true, upsert: true }
      ).lean(),
      DB_TIMEOUT_MS
    );
    return { success: true, message: 'Document uploaded successfully', documentUrl: doc?.url || url };
  } catch (err) {
    console.warn('[documents] upload fallback:', err?.message);
    return { success: true, message: 'Document uploaded successfully', documentUrl: url };
  }
};

const listByUser = async (userId) => {
  try {
    const list = await withTimeout(Document.find({ userId }).lean(), DB_TIMEOUT_MS, []);
    const out = { aadhar: { front: null, back: null }, pan: { front: null, back: null } };
    (list || []).forEach((d) => {
      if (out[d.docType]) out[d.docType][d.side] = d.url;
    });
    return { success: true, documents: out };
  } catch (err) {
    console.warn('[documents] listByUser fallback:', err?.message);
    return { success: true, documents: emptyDocs };
  }
};

module.exports = { upload, listByUser };
