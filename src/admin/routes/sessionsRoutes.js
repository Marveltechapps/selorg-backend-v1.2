const express = require('express');
const router = express.Router();
const sessionsController = require('../controllers/sessionsController');
const { authenticateToken, requirePermission } = require('../../core/middleware/auth.middleware');
const { PERMISSIONS } = require('../../config/permissions');
const asyncHandler = require('../../middleware/asyncHandler');

router.use(authenticateToken);
router.get('/', requirePermission(PERMISSIONS.COMPLIANCE_AUDIT_READ), asyncHandler(sessionsController.getSessions));
router.delete('/:id', requirePermission(PERMISSIONS.COMPLIANCE_AUDIT_READ), asyncHandler(sessionsController.revokeSession));

module.exports = router;
