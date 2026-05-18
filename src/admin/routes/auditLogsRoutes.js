const express = require('express');
const router = express.Router();
const auditLogsController = require('../controllers/auditLogsController');
const { authenticateToken, cacheMiddleware, requirePermission } = require('../../core/middleware');
const { PERMISSIONS } = require('../../config/permissions');
const appConfig = require('../../config/app');

router.get(
  '/logs',
  authenticateToken,
  requirePermission(PERMISSIONS.COMPLIANCE_AUDIT_READ),
  cacheMiddleware(appConfig.cache.admin.audit),
  auditLogsController.listLogs
);
router.get(
  '/logs/stats',
  authenticateToken,
  requirePermission(PERMISSIONS.COMPLIANCE_AUDIT_READ),
  cacheMiddleware(appConfig.cache.admin.audit),
  auditLogsController.getStats
);
router.get(
  '/logs/:id',
  authenticateToken,
  requirePermission(PERMISSIONS.COMPLIANCE_AUDIT_READ),
  cacheMiddleware(appConfig.cache.admin.audit),
  auditLogsController.getLog
);

module.exports = router;
