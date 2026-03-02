/**
 * Admin Compliance – violation alerts (expiry, audit failures, policy violations, etc.)
 */
const mongoose = require('mongoose');

const complianceViolationSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ['expiry', 'audit-failure', 'policy-violation', 'data-breach', 'regulatory'],
      default: 'expiry',
    },
    severity: {
      type: String,
      enum: ['critical', 'high', 'medium', 'low'],
      default: 'medium',
    },
    title: { type: String, required: true },
    description: { type: String, default: '' },
    affectedArea: { type: String, default: '' },
    status: {
      type: String,
      enum: ['open', 'investigating', 'resolved'],
      default: 'open',
    },
    assignedTo: { type: String, default: '' },
  },
  { timestamps: true }
);

complianceViolationSchema.index({ status: 1 });
complianceViolationSchema.index({ severity: 1 });

function toViolation(doc) {
  if (!doc) return null;
  const d = doc.toObject ? doc.toObject() : doc;
  return {
    id: d._id?.toString() || d.id,
    type: d.type,
    severity: d.severity,
    title: d.title,
    description: d.description || '',
    affectedArea: d.affectedArea || '',
    timestamp: d.createdAt?.toISOString?.() || d.timestamp || new Date().toISOString(),
    status: d.status,
    assignedTo: d.assignedTo || '',
  };
}

const ComplianceViolation = mongoose.model('ComplianceViolation', complianceViolationSchema, 'admin_compliance_violations');
module.exports = { ComplianceViolation, toViolation };
