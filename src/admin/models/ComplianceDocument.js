/**
 * Admin Compliance – regulatory documents (licenses, certificates, policies, etc.)
 */
const mongoose = require('mongoose');

const complianceDocumentSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    type: {
      type: String,
      enum: ['certificate', 'policy', 'license', 'audit', 'report', 'agreement'],
      default: 'policy',
    },
    category: {
      type: String,
      enum: ['data-protection', 'financial', 'operational', 'legal', 'security', 'tax'],
      default: 'legal',
    },
    status: {
      type: String,
      enum: ['valid', 'expiring-soon', 'expired', 'pending-renewal', 'under-review'],
      default: 'valid',
    },
    uploadedAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, default: null },
    fileSize: { type: String, default: '0 KB' },
    version: { type: String, default: '1.0' },
    uploadedBy: { type: String, required: true },
    description: { type: String, default: '' },
    tags: [{ type: String }],
    acknowledged: { type: Boolean, default: false },
    acknowledgedBy: [{ type: String }],
    fileUrl: { type: String }, // path or S3 URL
  },
  { timestamps: true }
);

complianceDocumentSchema.index({ type: 1, category: 1 });
complianceDocumentSchema.index({ status: 1 });
complianceDocumentSchema.index({ expiresAt: 1 });

complianceDocumentSchema.pre('save', function (next) {
  if (this.expiresAt) {
    const daysLeft = Math.ceil((this.expiresAt - new Date()) / (1000 * 60 * 60 * 24));
    if (daysLeft < 0) this.status = 'expired';
    else if (daysLeft <= 30) this.status = 'expiring-soon';
  }
  next();
});

function toDoc(doc) {
  if (!doc) return null;
  const d = doc.toObject ? doc.toObject() : doc;
  return {
    id: d._id?.toString() || d.id,
    name: d.name,
    type: d.type,
    category: d.category,
    status: d.status,
    uploadedAt: d.uploadedAt?.toISOString?.() || d.uploadedAt,
    expiresAt: d.expiresAt?.toISOString?.() || d.expiresAt || null,
    fileSize: d.fileSize,
    version: d.version,
    uploadedBy: d.uploadedBy,
    description: d.description || '',
    tags: d.tags || [],
    acknowledged: d.acknowledged || false,
    acknowledgedBy: d.acknowledgedBy || [],
    lastUpdated: d.updatedAt?.toISOString?.() || d.uploadedAt?.toISOString?.() || new Date().toISOString(),
  };
}

const ComplianceDocument = mongoose.model('ComplianceDocument', complianceDocumentSchema, 'admin_compliance_documents');
module.exports = { ComplianceDocument, toDoc };
