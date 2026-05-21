/**
 * Admin Compliance Controller
 * Endpoints: /admin/compliance/*
 * Regulatory documents, certifications, audits, policies, audit trails
 */
const { asyncHandler } = require('../../core/middleware');
const complianceService = require('../services/complianceService');
const path = require('path');
const { DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { uploadBufferToS3, s3Client } = require('../../utils/s3Upload');

function getComplianceBucket() {
  return process.env.AWS_S3_BUCKET_COMPLIANCE || process.env.AWS_S3_BUCKET || 'selorg-compliance-documents';
}

function formatFileSize(bytes = 0) {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
  return `${(bytes / 1024).toFixed(2)} KB`;
}

function getS3KeyFromUrl(url, bucket) {
  if (!url || typeof url !== 'string') return null;
  const marker = `.amazonaws.com/`;
  const idx = url.indexOf(marker);
  if (!url.includes(`https://${bucket}.s3`) || idx === -1) return null;
  return url.slice(idx + marker.length);
}

async function deleteS3ObjectByUrl(url) {
  const bucket = getComplianceBucket();
  const key = getS3KeyFromUrl(url, bucket);
  if (!key) return;
  await s3Client.send(
    new DeleteObjectCommand({
      Bucket: bucket,
      Key: key,
    })
  );
}

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
    const ext = path.extname(req.file.originalname || '').toLowerCase() || '.bin';
    const fileName = `compliance-${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`;
    filePath = await uploadBufferToS3(
      req.file.buffer,
      getComplianceBucket(),
      'compliance',
      fileName,
      req.file.mimetype || 'application/octet-stream'
    );
    fileSize = formatFileSize(req.file.size || 0);
  }

  const doc = await complianceService.createDocument(
    { name, type, category, description },
    uploadedBy,
    filePath,
    fileSize
  );
  res.status(201).json({ success: true, data: doc });
});

const updateDocument = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const existing = (await complianceService.listDocuments()).find((doc) => doc.id === id);
  if (!existing) {
    return res.status(404).json({ success: false, error: 'Document not found' });
  }

  const payload = {
    name: req.body.name,
    type: req.body.type,
    category: req.body.category,
    description: req.body.description,
  };

  if (req.file) {
    const ext = path.extname(req.file.originalname || '').toLowerCase() || '.bin';
    const fileName = `compliance-${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`;
    const fileUrl = await uploadBufferToS3(
      req.file.buffer,
      getComplianceBucket(),
      'compliance',
      fileName,
      req.file.mimetype || 'application/octet-stream'
    );
    payload.fileUrl = fileUrl;
    payload.fileSize = formatFileSize(req.file.size || 0);
    if (existing.fileUrl) {
      deleteS3ObjectByUrl(existing.fileUrl).catch(() => {});
    }
  }

  const updated = await complianceService.updateDocument(id, payload);
  if (!updated) {
    return res.status(404).json({ success: false, error: 'Document not found' });
  }
  res.json({ success: true, data: updated });
});

const deleteDocument = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const existing = (await complianceService.listDocuments()).find((doc) => doc.id === id);
  if (!existing) {
    return res.status(404).json({ success: false, error: 'Document not found' });
  }

  const deleted = await complianceService.deleteDocument(id);
  if (!deleted) {
    return res.status(404).json({ success: false, error: 'Document not found' });
  }

  if (existing.fileUrl) {
    deleteS3ObjectByUrl(existing.fileUrl).catch(() => {});
  }

  res.json({ success: true, data: deleted });
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
  updateDocument,
  deleteDocument,
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
