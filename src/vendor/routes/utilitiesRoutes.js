const express = require('express');
const router = express.Router();
const {
  upload,
  bulkUpload,
  getUploadHistory,
  getContracts,
  createContract,
  deleteContract,
  getAuditLogs,
  exportAuditLogs,
} = require('../controllers/utilitiesController');

// Upload history
router.get('/upload-history', getUploadHistory);

// Bulk vendor upload
router.post('/bulk-upload', upload.single('file'), bulkUpload);

// Contracts
router.get('/contracts', getContracts);
router.post('/contracts', createContract);
router.delete('/contracts/:contractId', deleteContract);

// Audit logs
router.get('/audit-logs', getAuditLogs);
router.post('/audit-logs/export', exportAuditLogs);

module.exports = router;
