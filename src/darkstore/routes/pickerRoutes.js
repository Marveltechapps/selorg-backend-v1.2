const express = require('express');
const router = express.Router();
const {
  getAvailablePickers,
  getPickersLive,
  getPickerPerformance,
  listPickers,
  getPerformanceSummary,
} = require('../controllers/pickerController');

// GET /api/darkstore/pickers/performance/summary — KPI summary (must be before /:id)
router.get('/performance/summary', getPerformanceSummary);
// GET /api/darkstore/pickers/available
router.get('/available', getAvailablePickers);
// GET /api/darkstore/pickers/live — Live Picker Board (PickerUser + heartbeat)
router.get('/live', getPickersLive);
// GET /api/darkstore/pickers — list pickers with metrics, ?risk=high filter
router.get('/', listPickers);
// GET /api/darkstore/pickers/:id/performance
router.get('/:id/performance', getPickerPerformance);

module.exports = router;

