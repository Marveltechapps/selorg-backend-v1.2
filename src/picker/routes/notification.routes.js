/**
 * Notification routes – from backend-workflow.yaml (notifications, notifications/:id/read, notifications/read-all).
 * Phase 1 RBAC: Dashboard endpoints for bulk send to pickers will require Admin role.
 */
const express = require('express');
const notificationController = require('../controllers/notification.controller');
const { requireAuth } = require('../middlewares/auth.middleware');

const router = express.Router();

router.get('/', requireAuth, notificationController.list);
router.put('/read-all', requireAuth, notificationController.markAllRead);
router.put('/:id/read', requireAuth, notificationController.markRead);

module.exports = router;
