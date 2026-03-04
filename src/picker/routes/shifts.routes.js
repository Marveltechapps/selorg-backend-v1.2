/**
 * Shifts routes – mobile (available, select, start, end) + dashboard (list, create, update, roster, assign).
 * Dashboard endpoints use core auth + Warehouse/Admin role.
 */
const express = require('express');
const shiftsController = require('../controllers/shifts.controller');
const shiftManagementController = require('../controllers/shiftManagement.controller');
const { requireAuth } = require('../middlewares/auth.middleware');
const { authenticateToken, requireRole } = require('../../core/middleware');

const router = express.Router();
const dashboardAuth = [authenticateToken, requireRole('warehouse', 'admin', 'super_admin')];

// Mobile picker app
router.get('/available', requireAuth, shiftsController.getAvailable);
router.post('/select', requireAuth, shiftsController.select);
router.post('/start', requireAuth, shiftsController.start);
router.post('/end', requireAuth, shiftsController.end);
router.post('/start-break', requireAuth, shiftsController.startBreak);
router.post('/end-break', requireAuth, shiftsController.endBreak);

// Dashboard: Shift Master CRUD + Roster (roster must be before :id)
router.get('/roster', ...dashboardAuth, shiftManagementController.getRoster);
router.get('/pickers', ...dashboardAuth, shiftManagementController.listPickers);
router.get('/', ...dashboardAuth, shiftManagementController.list);
router.post('/', ...dashboardAuth, shiftManagementController.create);
router.patch('/:id', ...dashboardAuth, shiftManagementController.update);
router.post('/:id/assign', ...dashboardAuth, shiftManagementController.assign);

module.exports = router;
