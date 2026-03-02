const express = require('express');
const router = express.Router();
const auditLogsController = require('../controllers/auditLogsController');
const { authenticateToken, cacheMiddleware } = require('../../core/middleware');
const appConfig = require('../../config/app');

router.get('/logs', authenticateToken, cacheMiddleware(appConfig.cache.admin.audit), auditLogsController.listLogs);
router.get('/logs/stats', authenticateToken, cacheMiddleware(appConfig.cache.admin.audit), auditLogsController.getStats);
router.get('/logs/:id', authenticateToken, cacheMiddleware(appConfig.cache.admin.audit), auditLogsController.getLog);

module.exports = router;
