/**
 * Admin Compliance – audit records and findings
 */
const mongoose = require('mongoose');

const auditFindingSchema = new mongoose.Schema(
  {
    severity: {
      type: String,
      enum: ['critical', 'major', 'minor', 'observation'],
      default: 'minor',
    },
    title: { type: String, required: true },
    description: { type: String, default: '' },
    status: {
      type: String,
      enum: ['open', 'in-progress', 'resolved', 'accepted-risk'],
      default: 'open',
    },
    assignedTo: { type: String, default: '' },
    dueDate: { type: Date },
  },
  { _id: true }
);

const complianceAuditSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    type: {
      type: String,
      enum: ['internal', 'external', 'regulatory', 'third-party'],
      default: 'internal',
    },
    status: {
      type: String,
      enum: ['scheduled', 'in-progress', 'completed', 'failed'],
      default: 'scheduled',
    },
    scheduledDate: { type: Date, required: true },
    completedDate: { type: Date },
    auditor: { type: String, required: true },
    auditorOrg: { type: String, default: '' },
    scope: [{ type: String }],
    findings: [auditFindingSchema],
    overallScore: { type: Number },
    criticalIssues: { type: Number, default: 0 },
    majorIssues: { type: Number, default: 0 },
    minorIssues: { type: Number, default: 0 },
  },
  { timestamps: true }
);

complianceAuditSchema.index({ status: 1 });
complianceAuditSchema.index({ scheduledDate: 1 });

function toFinding(f) {
  if (!f) return null;
  const d = f.toObject ? f.toObject() : f;
  return {
    id: d._id?.toString() || d.id,
    severity: d.severity,
    title: d.title,
    description: d.description || '',
    status: d.status,
    assignedTo: d.assignedTo || '',
    dueDate: d.dueDate?.toISOString?.() || d.dueDate || new Date().toISOString(),
  };
}

function toAudit(doc) {
  if (!doc) return null;
  const d = doc.toObject ? doc.toObject() : doc;
  return {
    id: d._id?.toString() || d.id,
    name: d.name,
    type: d.type,
    status: d.status,
    scheduledDate: d.scheduledDate?.toISOString?.() || d.scheduledDate,
    completedDate: d.completedDate?.toISOString?.() || d.completedDate,
    auditor: d.auditor,
    auditorOrg: d.auditorOrg || '',
    scope: d.scope || [],
    findings: (d.findings || []).map(toFinding),
    overallScore: d.overallScore,
    criticalIssues: d.criticalIssues ?? 0,
    majorIssues: d.majorIssues ?? 0,
    minorIssues: d.minorIssues ?? 0,
  };
}

const ComplianceAudit = mongoose.model('ComplianceAudit', complianceAuditSchema, 'admin_compliance_audits');
module.exports = { ComplianceAudit, toAudit, toFinding };
