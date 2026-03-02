const express = require('express');
const router = express.Router();
const dashboardController = require('../controllers/dashboardController');
const { cacheMiddleware } = require('../../core/middleware');
const appConfig = require('../../config/app');

// GET /dashboard/summary - Get dashboard summary (cached; per-store key in controller + HTTP cache)
router.get('/summary', cacheMiddleware(appConfig.cache.dashboard), dashboardController.getDashboardSummary);

module.exports = router;

