const express = require('express');
const router = express.Router();
const {
  getQCSummary,
  getQCInspections,
  createQCInspection,
  getTemperatureLogs,
  createTemperatureLog,
  getComplianceChecks,
  toggleComplianceCheck,
  getComplianceDocs,
  getSampleTests,
  createSampleTest,
  updateSampleResult,
  getRejections,
  createRejection,
  getQCFailures,
  getRecentFailures,
  resolveQCFailure,
  getWatchlist,
  addWatchlistItem,
  logQCCheck,
  getComplianceLogs,
  addComplianceLog,
  getAuditStatus,
  getActionHistory
} = require('../controllers/qcController');

router.get('/summary', getQCSummary);
router.get('/inspections', getQCInspections);
router.post('/inspections', createQCInspection);
router.get('/temperature', getTemperatureLogs);
router.post('/temperature', createTemperatureLog);
router.get('/checks', getComplianceChecks);
router.put('/checks/:itemId', toggleComplianceCheck);
router.get('/docs', getComplianceDocs);
router.get('/samples', getSampleTests);
router.post('/samples', createSampleTest);
router.put('/samples/:sampleId', updateSampleResult);
router.get('/rejections', getRejections);
router.post('/rejections', createRejection);
router.get('/history', getActionHistory);

// Legacy/Other endpoints
router.get('/failures', getRecentFailures);
router.get('/recent-failures', getRecentFailures);
router.post('/failures/:failureId/resolve', resolveQCFailure);
router.get('/watchlist', getWatchlist);
router.post('/watchlist', addWatchlistItem);
router.post('/watchlist/:sku/log-check', logQCCheck);
router.get('/compliance/logs', getComplianceLogs);
router.post('/compliance/logs', addComplianceLog);
router.get('/compliance/audit-status', getAuditStatus);

module.exports = router;
