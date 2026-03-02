const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../../core/middleware');

// Import all shared routes
const alertsRoutes = require('./alertsRoutes');
const analyticsRoutes = require('./analyticsRoutes');
const approvalsRoutes = require('./approvalsRoutes');
const communicationRoutes = require('./communicationRoutes');
const dashboardRoutes = require('./dashboardRoutes');
const systemHealthRoutes = require('./systemHealthRoutes');
const searchRoutes = require('./searchRoutes');
const inventorySyncRoutes = require('./inventorySyncRoutes');
const bulkOperationsRoutes = require('./bulkOperationsRoutes');
const workflowAutomationRoutes = require('./workflowAutomationRoutes');
const callLogRoutes = require('./callLogRoutes');
const escalationRoutes = require('./escalationRoutes');

// All shared routes require JWT (any authenticated dashboard role)
router.use(authenticateToken);
router.use('/alerts', alertsRoutes);
router.use('/analytics', analyticsRoutes);
router.use('/approvals', approvalsRoutes);
router.use('/communication', communicationRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/system-health', systemHealthRoutes);
router.use('/search', searchRoutes);
router.use('/inventory-sync', inventorySyncRoutes);
router.use('/bulk', bulkOperationsRoutes);
router.use('/automation', workflowAutomationRoutes);
router.use('/call-logs', callLogRoutes);
router.use('/escalations', escalationRoutes);

module.exports = router;
