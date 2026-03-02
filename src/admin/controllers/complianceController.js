/**
 * Admin Compliance Controller
 * Endpoints: /admin/compliance/*
 * Regulatory documents, certifications, audits, policies, audit trails
 */
const { asyncHandler } = require('../../core/middleware');
const complianceService = require('../services/complianceService');
const path = require('path');
const fs = require('fs');

const listDocuments = asyncHandler(async (req, res) => {
  const data = await complianceService.listDocuments();
  res.json({ success: true, data });
});

const uploadDocument = asyncHandler(async (req, res) => {
  const name = req.body.name || req.body.Name || 'Untitled Document';
  const type = req.body.type || req.body.Type || 'policy';
  const category = req.body.category || req.body.Category || 'legal';
  const description = req.body.description || req.body.Description || '';
  const uploadedBy = req.user?.email || req.user?.name || 'admin@quickcommerce.com';

  let filePath = null;
  let fileSize = '0 KB';
  if (req.file) {
    filePath = req.file.path;
    const bytes = req.file.size || 0;
    if (bytes >= 1024 * 1024) fileSize = `${(bytes / 1024 / 1024).toFixed(2)} MB`;
    else fileSize = `${(bytes / 1024).toFixed(2)} KB`;
  }

  const doc = await complianceService.createDocument(
    { name, type, category, description },
    uploadedBy,
    filePath,
    fileSize
  );
  res.status(201).json({ success: true, data: doc });
});

const listCertifications = asyncHandler(async (req, res) => {
  const data = await complianceService.listCertifications();
  res.json({ success: true, data });
});

const listAudits = asyncHandler(async (req, res) => {
  const data = await complianceService.listAudits();
  res.json({ success: true, data });
});

const createAudit = asyncHandler(async (req, res) => {
  const body = req.body || {};
  const payload = {
    name: body.name,
    type: body.type || 'internal',
    auditor: body.auditor,
    auditorOrg: body.auditorOrg,
    scheduledDate: body.scheduledDate,
    scope: body.scope || [],
  };
  const data = await complianceService.createAudit(payload);
  res.status(201).json({ success: true, data });
});

const updateFindingStatus = asyncHandler(async (req, res) => {
  const { auditId, findingId } = req.params;
  const { status } = req.body || {};
  if (!status) {
    return res.status(400).json({ success: false, error: 'status is required' });
  }
  const data = await complianceService.updateFindingStatus(auditId, findingId, status);
  if (!data) return res.status(404).json({ success: false, error: 'Audit or finding not found' });
  res.json({ success: true, data });
});

const listPolicies = asyncHandler(async (req, res) => {
  const data = await complianceService.listPolicies();
  res.json({ success: true, data });
});

const acknowledgePolicy = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const userEmail = req.user?.email || req.user?.name || req.body?.userEmail || 'admin@quickcommerce.com';
  const data = await complianceService.acknowledgePolicy(id, userEmail);
  if (!data) return res.status(404).json({ success: false, error: 'Policy not found' });
  res.json({ success: true, data });
});

const listViolations = asyncHandler(async (req, res) => {
  const data = await complianceService.listViolations();
  res.json({ success: true, data });
});

const getMetrics = asyncHandler(async (req, res) => {
  const data = await complianceService.getMetrics();
  res.json({ success: true, data });
});

const generateReport = asyncHandler(async (req, res) => {
  const [documents, certifications, audits, policies, violations, metrics] = await Promise.all([
    complianceService.listDocuments(),
    complianceService.listCertifications(),
    complianceService.listAudits(),
    complianceService.listPolicies(),
    complianceService.listViolations(),
    complianceService.getMetrics(),
  ]);
  const report = {
    generatedAt: new Date().toISOString(),
    metrics,
    documents,
    certifications,
    audits,
    policies,
    violations,
  };
  res.json({ success: true, data: report, url: null });
});

module.exports = {
  listDocuments,
  uploadDocument,
  listCertifications,
  listAudits,
  createAudit,
  updateFindingStatus,
  listPolicies,
  acknowledgePolicy,
  listViolations,
  getMetrics,
  generateReport,
};
