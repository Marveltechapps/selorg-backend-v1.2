const express = require('express');
const router = express.Router();
const accessLogsController = require('../controllers/accessLogsController');
const { authenticateToken, requirePermission } = require('../../core/middleware/auth.middleware');
const asyncHandler = require('../../middleware/asyncHandler');

router.use(authenticateToken);
router.get('/', requirePermission('view_access_logs'), asyncHandler(accessLogsController.getAccessLogs));

module.exports = router;
