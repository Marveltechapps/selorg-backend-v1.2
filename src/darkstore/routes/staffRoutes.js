const express = require('express');
const router = express.Router();
const {
  getStaffSummary,
  getStaffRoster,
  getShiftCoverage,
  getAbsences,
  logAbsence,
  getWeeklyRoster,
  publishRoster,
  autoAssignOT,
  getPerformance,
  downloadPerformanceReport,
} = require('../controllers/staffController');

router.get('/summary', getStaffSummary);
router.get('/roster', getStaffRoster);
router.get('/shift-coverage', getShiftCoverage);
router.get('/absences', getAbsences);
router.post('/absences', logAbsence);
router.get('/weekly-roster', getWeeklyRoster);
router.post('/weekly-roster/publish', publishRoster);
router.post('/shifts/auto-assign-ot', autoAssignOT);
router.get('/performance', getPerformance);
router.get('/performance/download', downloadPerformanceReport);

module.exports = router;

