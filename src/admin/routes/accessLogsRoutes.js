const express = require('express');
const router = express.Router();
const accessLogsController = require('../controllers/accessLogsController');
const { authenticateToken, requirePermission } = require('../../core/middleware/auth.middleware');
const { PERMISSIONS } = require('../../config/permissions');
const asyncHandler = require('../../middleware/asyncHandler');

router.use(authenticateToken);
router.get('/', requirePermission(PERMISSIONS.COMPLIANCE_AUDIT_READ), asyncHandler(accessLogsController.getAccessLogs));

module.exports = router;
