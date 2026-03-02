const mongoose = require('mongoose');

const legalDocumentSchema = new mongoose.Schema(
  {
    type: { type: String, required: true, enum: ['terms', 'privacy'] },
    version: { type: String, required: true },
    title: { type: String, required: true },
    effectiveDate: { type: String, required: true },
    lastUpdated: { type: String, required: true },
    contentFormat: { type: String, enum: ['plain', 'html', 'markdown'], default: 'plain' },
    content: { type: String, required: true },
    isCurrent: { type: Boolean, default: true },
  },
  { timestamps: true }
);

legalDocumentSchema.index({ type: 1, isCurrent: 1 });
legalDocumentSchema.index({ type: 1, version: 1 }, { unique: true });

const LegalDocument = mongoose.models.CustomerLegalDocument || mongoose.model('CustomerLegalDocument', legalDocumentSchema, 'customer_legal_documents');
module.exports = { LegalDocument };
