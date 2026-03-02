const express = require('express');
const router = express.Router();
const approvalsController = require('../controllers/approvalsController');
const { cacheMiddleware } = require('../../core/middleware');
const appConfig = require('../../config/app');

// Approvals endpoints (GETs cached)
router.get('/summary', cacheMiddleware(appConfig.cache.approvals), approvalsController.getApprovalSummary);
router.get('/queue', cacheMiddleware(appConfig.cache.approvals), approvalsController.listApprovals);
router.post('/queue', approvalsController.createApprovalRequest);
router.get('/queue/:id', cacheMiddleware(appConfig.cache.approvals), approvalsController.getApprovalById);
router.post('/queue/:id/approve', approvalsController.approveRequest);
router.post('/queue/:id/reject', approvalsController.rejectRequest);
router.post('/batch-approve', approvalsController.batchApprove);

module.exports = router;

