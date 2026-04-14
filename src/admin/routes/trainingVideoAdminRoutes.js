/**
 * Admin routes for Picker training video CRUD.
 * Requires admin or super_admin role.
 */
const express = require('express');
const { authenticateToken, requireRole } = require('../../core/middleware');
const controller = require('../controllers/trainingVideoAdmin.controller');

const router = express.Router();
// Allow dashboard admins to manage training videos.
// Note: the dashboard currently relies on role-based JWTs in some environments
// (permissions may be absent), so permission-only gating causes 403s on
// /api/v1/admin/training-videos from the Rider → Training & Kit screen.
const adminAuth = [authenticateToken, requireRole('admin', 'super_admin')];

router.get('/', ...adminAuth, controller.listVideos);
router.get('/picker-progress', ...adminAuth, controller.getPickerProgress);
router.get('/:id', ...adminAuth, controller.getVideoById);
router.post('/', ...adminAuth, controller.createVideo);
router.put('/:id', ...adminAuth, controller.updateVideo);
router.delete('/:id', ...adminAuth, controller.deleteVideo);

module.exports = router;
