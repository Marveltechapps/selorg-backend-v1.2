const express = require('express');
const operationsController = require('../controllers/operationsController');

const router = express.Router();

router.get('/sla-monitor', operationsController.getSlaMonitor);
router.get('/missing-items', operationsController.getMissingItems);
router.get('/live-picking', operationsController.getLivePickingMonitor);
router.get('/alerts', operationsController.getOperationalAlerts);
router.get('/exception-queue', operationsController.getExceptionQueue);
router.get('/pipeline', operationsController.getPipelineStats);
router.get('/activity-feed', operationsController.getActivityFeed);
router.get('/order-workflow/:orderId', operationsController.getOrderWorkflow);
router.get('/workflow-sla-metrics', operationsController.getWorkflowSlaMetrics);
router.get('/regional-pipeline', operationsController.getRegionalPipeline);
router.get('/escalation-suggestions', operationsController.getEscalationSuggestions);

module.exports = router;
