const express = require('express');
const router = express.Router();
const {
  getRiderPerformance,
  getSlaAdherence,
  getFleetUtilization,
  exportReport,
} = require('../controllers/analyticsController');

// GET /api/darkstore/analytics/rider-performance
router.get('/rider-performance', getRiderPerformance);

// GET /api/darkstore/analytics/sla-adherence
router.get('/sla-adherence', getSlaAdherence);

// GET /api/darkstore/analytics/fleet-utilization
router.get('/fleet-utilization', getFleetUtilization);

// POST /api/darkstore/analytics/export
router.post('/export', exportReport);

module.exports = router;

