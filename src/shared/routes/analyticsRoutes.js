const express = require('express');
const router = express.Router();
const analyticsController = require('../controllers/analyticsController');
const { cacheMiddleware } = require('../../core/middleware');
const appConfig = require('../../config/app');

// Analytics endpoints (GETs cached)
router.get('/rider-performance', cacheMiddleware(appConfig.cache.analytics), analyticsController.getRiderPerformance);
router.get('/sla-adherence', cacheMiddleware(appConfig.cache.analytics), analyticsController.getSlaAdherence);
router.get('/fleet-utilization', cacheMiddleware(appConfig.cache.analytics), analyticsController.getFleetUtilization);
router.post('/reports/export', analyticsController.exportReport);

module.exports = router;

