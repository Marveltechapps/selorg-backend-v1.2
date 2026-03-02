const express = require('express');
const router = express.Router();
const workforceController = require('../controllers/workforceController');

// Staff Management
router.get('/staff', workforceController.getStaff);
router.post('/staff', workforceController.addStaff);
router.get('/staff/:id', workforceController.getStaffDetails);
router.get('/staff/:id/details', workforceController.getStaffDetails);

// Shift Scheduling
router.get('/schedule', workforceController.getSchedule);
router.post('/schedule', workforceController.createSchedule);
router.get('/schedule/:id', workforceController.getSchedule);
router.post('/schedule/:id/assign', workforceController.assignStaff);

// Attendance & Performance & Leave
router.get('/attendance', workforceController.getAttendance);
router.get('/performance', workforceController.getPerformance);
router.get('/leave-requests', workforceController.getLeaveRequests);
router.post('/leave-requests', workforceController.createLeaveRequest);
router.put('/leave-requests/:id/status', workforceController.updateLeaveStatus);

// Training sessions
router.get('/training', workforceController.getTrainings);
router.get('/training/:id', workforceController.getTrainingDetails);
router.get('/training/:id/details', workforceController.getTrainingDetails);
router.post('/training/:id/enroll', workforceController.enrollStaff);

// Attendance
router.post('/attendance', workforceController.logAttendance);

module.exports = router;

