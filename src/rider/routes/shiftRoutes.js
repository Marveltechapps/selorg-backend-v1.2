const express = require('express');
const shiftController = require('../controllers/shiftController');
const { authenticateToken, requireRole } = require('../../core/middleware');
const { requireRiderOpsPermission } = require('../middleware/riderOpsPermissions');

const router = express.Router();

const fleetAuth = [authenticateToken, requireRole('rider', 'admin', 'super_admin')];
const shiftManage = [...fleetAuth, requireRiderOpsPermission('shift.manage')];

// Specific rider routes must come BEFORE the generic :id route
router.get('/available/list', shiftController.getAvailable);
router.get('/my', shiftController.myShifts);
router.post('/select', shiftController.select);
router.post('/cancel', shiftController.cancel);
router.post('/start', shiftController.start);
router.post('/end', shiftController.end);

// Admin/dashboard CRUD
router.get('/filter-options', ...fleetAuth, shiftController.filterOptions);
router.get('/', ...fleetAuth, shiftController.list);
router.post('/', ...fleetAuth, shiftController.create);
router.get('/:id/assignments', ...fleetAuth, shiftController.getAssignments);
router.post('/:id/assignments', ...shiftManage, shiftController.assignRider);
router.delete('/:id/assignments/:riderId', ...shiftManage, shiftController.unassignRider);
router.get('/:id', ...fleetAuth, shiftController.getById);
router.put('/:id', ...fleetAuth, shiftController.update);
router.delete('/:id', ...fleetAuth, shiftController.remove);

module.exports = router;
