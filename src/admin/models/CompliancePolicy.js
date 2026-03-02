/**
 * Admin Compliance – internal policies requiring acknowledgment
 */
const mongoose = require('mongoose');

const compliancePolicySchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    category: {
      type: String,
      enum: ['privacy', 'security', 'hr', 'operational', 'financial', 'legal'],
      default: 'legal',
    },
    version: { type: String, default: '1.0' },
    status: {
      type: String,
      enum: ['active', 'draft', 'under-review', 'archived'],
      default: 'active',
    },
    effectiveDate: { type: Date, required: true },
    reviewDate: { type: Date },
    owner: { type: String, default: '' },
    approvedBy: { type: String, default: '' },
    description: { type: String, default: '' },
    requiresAcknowledgment: { type: Boolean, default: false },
    totalEmployees: { type: Number, default: 0 },
    acknowledgedEmployees: { type: Number, default: 0 },
    acknowledgedBy: [{ type: String }], // user emails who acknowledged
  },
  { timestamps: true }
);

compliancePolicySchema.index({ status: 1 });
compliancePolicySchema.index({ category: 1 });

function toPolicy(doc) {
  if (!doc) return null;
  const d = doc.toObject ? doc.toObject() : doc;
  const total = d.totalEmployees ?? 0;
  const ack = d.acknowledgedEmployees ?? (d.acknowledgedBy?.length ?? 0);
  const rate = total > 0 ? Math.round((ack / total) * 100) : 0;
  return {
    id: d._id?.toString() || d.id,
    name: d.name,
    category: d.category,
    version: d.version,
    status: d.status,
    effectiveDate: d.effectiveDate?.toISOString?.().slice(0, 10) || d.effectiveDate,
    reviewDate: d.reviewDate?.toISOString?.().slice(0, 10) || d.reviewDate || d.effectiveDate,
    owner: d.owner || '',
    approvedBy: d.approvedBy || '',
    description: d.description || '',
    requiresAcknowledgment: d.requiresAcknowledgment || false,
    acknowledgmentRate: rate,
    totalEmployees: total,
    acknowledgedEmployees: ack,
  };
}

const CompliancePolicy = mongoose.model('CompliancePolicy', compliancePolicySchema, 'admin_compliance_policies');
module.exports = { CompliancePolicy, toPolicy };
