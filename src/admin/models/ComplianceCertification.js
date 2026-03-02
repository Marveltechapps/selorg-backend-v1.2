/**
 * Admin Compliance – certifications (ISO, PCI-DSS, SOC2, GDPR, etc.)
 */
const mongoose = require('mongoose');

const complianceCertificationSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    issuer: { type: String, required: true },
    certNumber: { type: String, required: true },
    type: {
      type: String,
      enum: ['ISO', 'PCI-DSS', 'SOC2', 'GDPR', 'HIPAA', 'Other'],
      default: 'Other',
    },
    status: {
      type: String,
      enum: ['active', 'expiring-soon', 'expired', 'pending'],
      default: 'active',
    },
    issuedDate: { type: Date, required: true },
    expiryDate: { type: Date, required: true },
    scope: { type: String, default: '' },
    auditedBy: { type: String, default: '' },
    nextAudit: { type: Date },
    score: { type: Number },
    attachments: { type: Number, default: 0 },
  },
  { timestamps: true }
);

complianceCertificationSchema.index({ status: 1 });
complianceCertificationSchema.index({ expiryDate: 1 });

complianceCertificationSchema.pre('save', function (next) {
  if (this.expiryDate) {
    const daysLeft = Math.ceil((this.expiryDate - new Date()) / (1000 * 60 * 60 * 24));
    if (daysLeft < 0) this.status = 'expired';
    else if (daysLeft <= 60) this.status = 'expiring-soon';
  }
  next();
});

function toCert(doc) {
  if (!doc) return null;
  const d = doc.toObject ? doc.toObject() : doc;
  return {
    id: d._id?.toString() || d.id,
    name: d.name,
    issuer: d.issuer,
    certNumber: d.certNumber,
    type: d.type,
    status: d.status,
    issuedDate: d.issuedDate?.toISOString?.() || d.issuedDate,
    expiryDate: d.expiryDate?.toISOString?.() || d.expiryDate,
    scope: d.scope || '',
    auditedBy: d.auditedBy || '',
    nextAudit: d.nextAudit?.toISOString?.() || d.expiryDate?.toISOString?.() || d.expiryDate,
    score: d.score,
    attachments: d.attachments ?? 0,
  };
}

const ComplianceCertification = mongoose.model('ComplianceCertification', complianceCertificationSchema, 'admin_compliance_certifications');
module.exports = { ComplianceCertification, toCert };
