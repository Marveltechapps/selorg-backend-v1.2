const express = require('express');
const { authenticateToken, requireRole } = require('../../core/middleware');
const { requireRiderOpsPermission } = require('../middleware/riderOpsPermissions');
const riderAuditController = require('../controllers/riderAuditController');

const router = express.Router();

router.get(
  '/logs',
  authenticateToken,
  requireRole('rider', 'admin', 'super_admin'),
  requireRiderOpsPermission('audit.view'),
  riderAuditController.list
);

module.exports = router;
