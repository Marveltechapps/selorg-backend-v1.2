const express = require('express');
const router = express.Router();
const systemHealthController = require('../controllers/systemHealthController');
const { cacheMiddleware } = require('../../core/middleware');
const appConfig = require('../../config/app');

// System health endpoints (GETs cached)
router.get('/summary', cacheMiddleware(appConfig.cache.systemHealth), systemHealthController.getSystemHealthSummary);
router.get('/devices', cacheMiddleware(appConfig.cache.systemHealth), systemHealthController.listDeviceHealth);
router.get('/devices/:id', cacheMiddleware(appConfig.cache.systemHealth), systemHealthController.getDeviceHealthById);
router.post('/diagnostics/run', systemHealthController.runDiagnostics);
router.get('/diagnostics/reports/:reportId', cacheMiddleware(appConfig.cache.systemHealth), systemHealthController.getDiagnosticsReport);

module.exports = router;

