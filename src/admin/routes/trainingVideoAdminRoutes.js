/**
 * Admin routes for Picker training video CRUD.
 * Requires admin or super_admin role.
 */
const express = require('express');
const { authenticateToken, requireRole, requirePermission } = require('../../core/middleware');
const controller = require('../controllers/trainingVideoAdmin.controller');

const router = express.Router();
// Require a specific permission to manage training videos.
// This is safer than granting broad role access; assign the 'training_videos.manage'
// permission to users who need CRUD access.
const adminAuth = [authenticateToken, requirePermission('training_videos.manage')];

router.get('/', ...adminAuth, controller.listVideos);
router.get('/:id', ...adminAuth, controller.getVideoById);
router.post('/', ...adminAuth, controller.createVideo);
router.put('/:id', ...adminAuth, controller.updateVideo);
router.delete('/:id', ...adminAuth, controller.deleteVideo);

module.exports = router;
