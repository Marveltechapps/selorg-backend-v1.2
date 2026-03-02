const express = require('express');
const router = express.Router();
const staffController = require('../controllers/staffController');

// Staff summary
router.get('/summary', staffController.getStaffSummary);

// Staff management
router.get('/', staffController.listStaff);

// Shifts
router.get('/shifts', staffController.listShifts);
router.post('/shifts', staffController.createShift);
router.get('/shifts/:id', staffController.getShiftById);
router.put('/shifts/:id', staffController.updateShift);
router.get('/shifts/coverage', staffController.getShiftCoverage);

// Weekly roster
router.get('/roster/weekly', staffController.getWeeklyRoster);
router.post('/roster/weekly/publish', staffController.publishWeeklyRoster);

// Absences
router.get('/absences', staffController.listAbsences);
router.post('/absences', staffController.logAbsence);

// Auto-assign shifts
router.post('/shifts/auto-assign', staffController.autoAssignShifts);

// Performance
router.get('/performance', staffController.getStaffPerformance);
router.get('/incentive-criteria', staffController.getIncentiveCriteria);

module.exports = router;

