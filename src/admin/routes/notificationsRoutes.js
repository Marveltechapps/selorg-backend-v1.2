const express = require('express');
const router = express.Router();
const notificationsController = require('../controllers/notificationsController');
const { authenticateToken, cacheMiddleware } = require('../../core/middleware');
const appConfig = require('../../config/app');

const cacheTtl = appConfig.cache?.admin?.default ?? 60;

// Templates
router.get('/templates', authenticateToken, cacheMiddleware(cacheTtl), notificationsController.listTemplates);
router.post('/templates', authenticateToken, notificationsController.createTemplate);
router.put('/templates/:id', authenticateToken, notificationsController.updateTemplate);
router.delete('/templates/:id', authenticateToken, notificationsController.deleteTemplate);

// Campaigns
router.get('/campaigns', authenticateToken, cacheMiddleware(cacheTtl), notificationsController.listCampaigns);
router.post('/campaigns', authenticateToken, notificationsController.createCampaign);
router.put('/campaigns/:id', authenticateToken, notificationsController.updateCampaignStatus);

// Scheduled
router.get('/scheduled', authenticateToken, cacheMiddleware(cacheTtl), notificationsController.listScheduled);

// Automation
router.get('/automation', authenticateToken, cacheMiddleware(cacheTtl), notificationsController.listAutomation);
router.post('/automation', authenticateToken, notificationsController.createAutomation);
router.put('/automation/:id', authenticateToken, notificationsController.updateAutomationStatus);

// Analytics & History
router.get('/analytics', authenticateToken, cacheMiddleware(cacheTtl), notificationsController.getAnalytics);
router.get('/history', authenticateToken, cacheMiddleware(cacheTtl), notificationsController.listHistory);
router.get('/channels', authenticateToken, cacheMiddleware(cacheTtl), notificationsController.getChannels);
router.get('/timeseries', authenticateToken, cacheMiddleware(cacheTtl), notificationsController.getTimeSeries);

module.exports = router;
