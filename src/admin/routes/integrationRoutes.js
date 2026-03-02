/**
 * Integration Manager Routes
 * Mounted at /api/v1/admin/integrations
 */
const express = require('express');
const router = express.Router();
const integrationController = require('../controllers/integrationController');

// Integrations - static paths first (before :id)
router.get('/', integrationController.list);
router.get('/health', integrationController.health);
router.get('/webhooks', integrationController.listWebhooks);
router.post('/webhooks', integrationController.createWebhook);
router.post('/webhooks/:webhookId/retry', integrationController.retryWebhook);
router.get('/api-keys', integrationController.listApiKeys);
router.post('/api-keys', integrationController.createApiKey);
router.delete('/api-keys/:keyId', integrationController.revokeApiKey);
router.get('/logs', integrationController.listLogs);
router.get('/stats', integrationController.stats);

// Integration by id
router.put('/:id', integrationController.update);
router.patch('/:id', integrationController.toggle);
router.post('/:id/test', integrationController.test);

module.exports = router;
