/**
 * Admin System Config Routes
 * Mounted at /api/v1/admin/system
 */
const express = require('express');
const router = express.Router();
const systemConfigController = require('../controllers/systemConfigController');
const systemToolsController = require('../controllers/systemToolsController');

// --- System Tools (server status, instances, logs, performance) ---
// All require admin/super_admin via parent router
router.get('/server-status', systemToolsController.getServerStatus);
router.get('/instances', systemToolsController.listInstances);
router.post('/instances/:id/restart', systemToolsController.restartInstance);
router.get('/logs', systemToolsController.getLogs);
router.get('/performance', systemToolsController.getPerformanceMetrics);
router.get('/cache/stats', systemToolsController.getCacheStats);
router.post('/cache/clear', systemToolsController.clearCache);
router.get('/api-endpoints', systemToolsController.getApiEndpoints);
router.get('/migrations', systemToolsController.getMigrations);

// Config sections (key-value)
router.get('/general', systemConfigController.getGeneral);
router.put('/general', systemConfigController.updateGeneral);
router.get('/delivery', systemConfigController.getDelivery);
router.put('/delivery', systemConfigController.updateDelivery);
router.get('/notifications', systemConfigController.getNotifications);
router.put('/notifications', systemConfigController.updateNotifications);
router.get('/tax-settings', systemConfigController.getTax);
router.put('/tax-settings', systemConfigController.updateTax);
router.get('/advanced', systemConfigController.getAdvanced);
router.put('/advanced', systemConfigController.updateAdvanced);

// Payment gateways
router.get('/payment-gateways', systemConfigController.listPaymentGateways);
router.put('/payment-gateways/:id', systemConfigController.updatePaymentGateway);

// Feature flags
router.get('/feature-flags', systemConfigController.listFeatureFlags);
router.put('/feature-flags/:id/toggle', systemConfigController.toggleFeatureFlag);

// Integrations
router.get('/integrations', systemConfigController.listIntegrations);
router.put('/integrations/:id', systemConfigController.updateIntegration);
router.post('/integrations/:id/test', systemConfigController.testIntegration);

// API Key Management
router.get('/api-keys', systemConfigController.listApiKeys);
router.post('/api-keys', systemConfigController.createApiKey);
router.post('/api-keys/:id/revoke', systemConfigController.revokeApiKey);
router.post('/api-keys/:id/rotate', systemConfigController.rotateApiKey);

// Cron Jobs (System Config submenu)
router.get('/cron-jobs', systemConfigController.listCronJobs);
router.post('/cron-jobs/:jobId/trigger', systemConfigController.triggerCronJob);
router.put('/cron-jobs/:jobId', systemConfigController.toggleCronJob);

// Env Variables (System Config submenu)
router.get('/env-variables', systemConfigController.listEnvVariables);
router.put('/env-variables/:key', systemConfigController.updateEnvVariable);

// Maintenance Mode (System Config submenu)
router.get('/maintenance', systemConfigController.getMaintenanceMode);
router.post('/maintenance', systemConfigController.toggleMaintenanceMode);

module.exports = router;
