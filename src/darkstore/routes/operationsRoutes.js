const express = require('express');
const operationsController = require('../controllers/operationsController');

const router = express.Router();

router.get('/sla-monitor', operationsController.getSlaMonitor);
router.get('/missing-items', operationsController.getMissingItems);
router.get('/live-picking', operationsController.getLivePickingMonitor);
router.get('/alerts', operationsController.getOperationalAlerts);

module.exports = router;
