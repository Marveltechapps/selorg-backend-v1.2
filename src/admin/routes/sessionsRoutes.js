const express = require('express');
const router = express.Router();
const sessionsController = require('../controllers/sessionsController');
const { authenticateToken, requirePermission } = require('../../core/middleware/auth.middleware');
const asyncHandler = require('../../middleware/asyncHandler');

router.use(authenticateToken);
router.get('/', requirePermission('view_access_logs'), asyncHandler(sessionsController.getSessions));
router.delete('/:id', requirePermission('view_access_logs'), asyncHandler(sessionsController.revokeSession));

module.exports = router;
