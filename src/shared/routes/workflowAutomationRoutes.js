const express = require('express');
const router = express.Router();
const workflowAutomationController = require('../controllers/workflowAutomationController');
const { authenticateToken, cacheMiddleware } = require('../../core/middleware');
const appConfig = require('../../config/app');

/**
 * Workflow Automation Routes
 */

// POST /api/v1/shared/automation/rules - Create automation rule
router.post('/rules', authenticateToken, workflowAutomationController.createRule);

// POST /api/v1/shared/automation/trigger - Trigger automation
router.post('/trigger', authenticateToken, workflowAutomationController.triggerAutomation);

// POST /api/v1/shared/automation/schedule - Schedule automation task
router.post('/schedule', authenticateToken, workflowAutomationController.scheduleTask);

// GET /api/v1/shared/automation/rules - Get all rules
router.get('/rules', authenticateToken, cacheMiddleware(appConfig.cache.automation), workflowAutomationController.getRules);

module.exports = router;
