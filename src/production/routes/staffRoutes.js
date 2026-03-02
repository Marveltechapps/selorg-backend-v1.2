const express = require('express');
const router = express.Router();
const {
  getStaffSummary,
  getStaffRoster,
  createShiftCoverage,
  getShiftCoverage,
  getAbsences,
  logAbsence,
  getWeeklyRoster,
  publishRoster,
  autoAssignOT,
  getPerformance,
  downloadPerformanceReport,
  createStaff,
  updateStaffStatus,
  getAttendance,
  markAttendancePresent,
} = require('../controllers/staffController');

router.post('/', createStaff);
router.get('/summary', getStaffSummary);
router.get('/roster', getStaffRoster);
router.get('/shift-coverage', getShiftCoverage);
router.post('/shift-coverage', createShiftCoverage);
router.get('/absences', getAbsences);
router.post('/absences', logAbsence);
router.get('/weekly-roster', getWeeklyRoster);
router.post('/weekly-roster/publish', publishRoster);
router.post('/shifts/auto-assign-ot', autoAssignOT);
router.get('/performance', getPerformance);
router.get('/performance/download', downloadPerformanceReport);
router.get('/attendance', getAttendance);
router.patch('/attendance/:recordId/mark-present', markAttendancePresent);
router.patch('/:staffId/status', updateStaffStatus);

module.exports = router;

