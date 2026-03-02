const express = require('express');
const router = express.Router();
const {
  generateLabel,
  bulkUpload,
  downloadUploadTemplate,
  getSystemStatus,
  runSystemDiagnostics,
  forceGlobalSync,
  getAuditLogs,
  exportAuditLogs,
} = require('../controllers/utilitiesController');

// POST /api/darkstore/utilities/labels/generate
router.post('/labels/generate', generateLabel);

// POST /api/darkstore/utilities/inventory/bulk-upload
router.post('/inventory/bulk-upload', bulkUpload);

// GET /api/darkstore/utilities/inventory/upload-template
router.get('/inventory/upload-template', downloadUploadTemplate);

// GET /api/darkstore/utilities/system/status
router.get('/system/status', getSystemStatus);

// POST /api/darkstore/utilities/system/diagnostics
router.post('/system/diagnostics', runSystemDiagnostics);

// POST /api/darkstore/utilities/system/sync
router.post('/system/sync', forceGlobalSync);

// GET /api/darkstore/utilities/audit-logs
router.get('/audit-logs', getAuditLogs);

// POST /api/darkstore/utilities/audit-logs/export
router.post('/audit-logs/export', exportAuditLogs);

module.exports = router;

