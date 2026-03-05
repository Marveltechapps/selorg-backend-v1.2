/**
 * Admin Picker Action Logs Routes
 * RBAC: Admin or Workforce role.
 */
const express = require('express');
const { authenticateToken, requireRole } = require('../../core/middleware');
const pickerApprovalsController = require('../controllers/pickerApprovals.controller');

const router = express.Router();
const adminOrWorkforce = [authenticateToken, requireRole('admin', 'super_admin', 'workforce')];

router.get('/', ...adminOrWorkforce, pickerApprovalsController.listAllPickerActionLogs);

module.exports = router;
