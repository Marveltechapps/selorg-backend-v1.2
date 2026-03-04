/**
 * Warehouse Attendance routes – Live Attendance for Picker Workforce
 */
const express = require('express');
const liveAttendanceController = require('../controllers/liveAttendance.controller');

const router = express.Router();

router.get('/live', liveAttendanceController.getLive);

module.exports = router;
