/**
 * Admin Compliance routes – mounted at /api/v1/admin/compliance
 * Regulatory documents, certifications, audits, policies, audit trails
 */
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const complianceController = require('../controllers/complianceController');

const router = express.Router();

const uploadDir = process.env.FILE_UPLOAD_DIR || 'uploads';
const complianceUploadDir = path.join(uploadDir, 'compliance');
if (!fs.existsSync(complianceUploadDir)) {
  fs.mkdirSync(complianceUploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, complianceUploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.pdf';
    const name = `compliance-${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`;
    cb(null, name);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: parseInt(process.env.MAX_UPLOAD_SIZE, 10) || 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = /\.(pdf|doc|docx|jpg|jpeg|png|gif|webp)$/i;
    if (allowed.test(file.originalname)) cb(null, true);
    else cb(new Error('Invalid file type. Allowed: pdf, doc, docx, jpg, jpeg, png, gif, webp'));
  },
});

router.get('/documents', complianceController.listDocuments);
router.post('/documents', upload.single('file'), complianceController.uploadDocument);

router.get('/certifications', complianceController.listCertifications);
router.get('/audits', complianceController.listAudits);
router.post('/audits', complianceController.createAudit);
router.patch('/audits/:auditId/findings/:findingId', complianceController.updateFindingStatus);

router.get('/policies', complianceController.listPolicies);
router.post('/policies/:id/acknowledge', complianceController.acknowledgePolicy);

router.get('/violations', complianceController.listViolations);
router.get('/metrics', complianceController.getMetrics);
router.post('/reports/generate', complianceController.generateReport);

module.exports = router;
