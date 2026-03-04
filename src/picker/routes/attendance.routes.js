/**
 * Attendance routes – from backend-workflow.yaml (attendance/summary).
 * Phase 1 RBAC: Dashboard endpoints for attendance reports, mark absent will require Warehouse role.
 * Punch endpoints delegate to shifts service (punch-in/out, start-break/end-break).
 */
const express = require('express');
const attendanceController = require('../controllers/attendance.controller');
const shiftsController = require('../controllers/shifts.controller');
const { requireAuth } = require('../middlewares/auth.middleware');

const router = express.Router();

router.get('/summary', requireAuth, attendanceController.getSummary);
router.get('/stats', requireAuth, attendanceController.getStats);

// Punch endpoints (alias for shifts/start, shifts/end, shifts/start-break, shifts/end-break)
router.post('/punch-in', requireAuth, shiftsController.start);
router.post('/punch-out', requireAuth, shiftsController.end);
router.post('/start-break', requireAuth, shiftsController.startBreak);
router.post('/end-break', requireAuth, shiftsController.endBreak);

module.exports = router;
