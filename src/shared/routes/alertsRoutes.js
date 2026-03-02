const express = require('express');
const router = express.Router();
const alertsController = require('../controllers/alertsController');
const { cacheMiddleware } = require('../../core/middleware');
const appConfig = require('../../config/app');

// Alerts endpoints (GETs cached)
router.get('/', cacheMiddleware(appConfig.cache.alerts), alertsController.listAlerts);
router.put('/read-all', alertsController.markAllRead);
router.get('/:id', cacheMiddleware(appConfig.cache.alerts), alertsController.getAlertById);
router.post('/:id/action', alertsController.performAlertAction);
router.delete('/', alertsController.clearResolvedAlerts);

module.exports = router;

