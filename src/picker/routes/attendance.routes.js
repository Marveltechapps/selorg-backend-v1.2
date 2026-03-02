/**
 * Attendance routes – from backend-workflow.yaml (attendance/summary).
 */
const express = require('express');
const attendanceController = require('../controllers/attendance.controller');
const { requireAuth } = require('../middlewares/auth.middleware');

const router = express.Router();

router.get('/summary', requireAuth, attendanceController.getSummary);
router.get('/stats', requireAuth, attendanceController.getStats);

module.exports = router;
