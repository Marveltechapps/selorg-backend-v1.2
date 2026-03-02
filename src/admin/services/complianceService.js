/**
 * Admin Compliance Service – documents, certifications, audits, policies, violations
 */
const { ComplianceDocument, toDoc } = require('../models/ComplianceDocument');
const { ComplianceCertification, toCert } = require('../models/ComplianceCertification');
const { ComplianceAudit, toAudit } = require('../models/ComplianceAudit');
const { CompliancePolicy, toPolicy } = require('../models/CompliancePolicy');
const { ComplianceViolation, toViolation } = require('../models/ComplianceViolation');
const mongoose = require('mongoose');

async function listDocuments() {
  const docs = await ComplianceDocument.find().sort({ uploadedAt: -1 }).lean();
  return docs.map((d) => {
    const obj = { ...d, id: d._id.toString(), lastUpdated: d.updatedAt || d.uploadedAt };
    return toDoc(obj);
  });
}

async function createDocument(payload, uploadedBy, filePath, fileSize) {
  const doc = new ComplianceDocument({
    name: payload.name,
    type: payload.type || 'policy',
    category: payload.category || 'legal',
    description: payload.description || '',
    tags: payload.tags || [],
    uploadedBy,
    fileUrl: filePath,
    fileSize: fileSize || '0 KB',
  });
  await doc.save();
  return toDoc(doc);
}

async function listCertifications() {
  const certs = await ComplianceCertification.find().sort({ expiryDate: 1 }).lean();
  return certs.map((c) => toCert({ ...c, id: c._id.toString() }));
}

async function listAudits() {
  const audits = await ComplianceAudit.find().sort({ scheduledDate: -1 }).lean();
  return audits.map((a) => toAudit({ ...a, id: a._id.toString() }));
}

async function createAudit(payload) {
  const audit = new ComplianceAudit({
    name: payload.name,
    type: payload.type || 'internal',
    auditor: payload.auditor || '',
    auditorOrg: payload.auditorOrg || 'Internal Audit Team',
    scheduledDate: payload.scheduledDate ? new Date(payload.scheduledDate) : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    scope: payload.scope || [],
  });
  await audit.save();
  return toAudit(audit);
}

async function updateFindingStatus(auditId, findingId, status) {
  const audit = await ComplianceAudit.findById(auditId);
  if (!audit) return null;
  const finding = audit.findings.id(findingId);
  if (!finding) return null;
  finding.status = status;
  await audit.save();
  return toAudit(audit);
}

async function listPolicies() {
  const policies = await CompliancePolicy.find().sort({ effectiveDate: -1 }).lean();
  return policies.map((p) => toPolicy({ ...p, id: p._id.toString() }));
}

async function acknowledgePolicy(policyId, userEmail) {
  const policy = await CompliancePolicy.findById(policyId);
  if (!policy) return null;
  const acked = policy.acknowledgedBy || [];
  if (!acked.includes(userEmail)) {
    acked.push(userEmail);
    policy.acknowledgedBy = acked;
    policy.acknowledgedEmployees = acked.length;
    await policy.save();
  }
  return toPolicy(policy);
}

async function listViolations() {
  const violations = await ComplianceViolation.find({ status: { $ne: 'resolved' } })
    .sort({ createdAt: -1 })
    .lean();
  return violations.map((v) => toViolation({ ...v, id: v._id.toString() }));
}

async function getMetrics() {
  const [
    docs,
    certs,
    audits,
    policies,
    violations,
  ] = await Promise.all([
    ComplianceDocument.find().lean(),
    ComplianceCertification.find().lean(),
    ComplianceAudit.find().lean(),
    CompliancePolicy.find().lean(),
    ComplianceViolation.find({ status: { $ne: 'resolved' } }).lean(),
  ]);

  const validDocs = docs.filter((d) => d.status === 'valid').length;
  const activeCerts = certs.filter((c) => c.status === 'active').length;
  const completedAudits = audits.filter((a) => a.status === 'completed').length;
  let openFindings = 0;
  let criticalFindings = 0;
  for (const a of audits) {
    for (const f of a.findings || []) {
      if (f.status !== 'resolved' && f.status !== 'accepted-risk') {
        openFindings++;
        if (f.severity === 'critical') criticalFindings++;
      }
    }
  }

  const policyAckRates = policies
    .filter((p) => p.requiresAcknowledgment)
    .map((p) => (p.totalEmployees > 0 ? (p.acknowledgedEmployees || 0) / p.totalEmployees : 1));
  const policyCompliance = policyAckRates.length
    ? Math.round(policyAckRates.reduce((a, b) => a + b, 0) / policyAckRates.length * 100)
    : 100;

  const totalDocs = docs.length;
  const overallScore = totalDocs === 0
    ? 100
    : Math.round(
        (validDocs / totalDocs * 30 +
          (activeCerts / Math.max(certs.length, 1)) * 25 +
          policyCompliance / 100 * 25 +
          (1 - Math.min(openFindings, 10) / 10) * 20) *
          0.95
      );

  return {
    overallScore: Math.min(100, Math.max(0, overallScore)),
    totalDocuments: totalDocs,
    validDocuments: validDocs,
    expiringDocuments: docs.filter((d) => d.status === 'expiring-soon').length,
    expiredDocuments: docs.filter((d) => d.status === 'expired').length,
    activeCertifications: activeCerts,
    completedAudits,
    openFindings,
    criticalFindings,
    policyCompliance,
  };
}

module.exports = {
  listDocuments,
  createDocument,
  listCertifications,
  listAudits,
  createAudit,
  updateFindingStatus,
  listPolicies,
  acknowledgePolicy,
  listViolations,
  getMetrics,
};
