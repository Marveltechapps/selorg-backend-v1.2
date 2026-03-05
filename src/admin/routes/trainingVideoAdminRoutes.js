/**
 * Admin routes for Picker training video CRUD.
 * Requires admin or super_admin role.
 */
const express = require('express');
const { authenticateToken, requireRole } = require('../../core/middleware');
const controller = require('../controllers/trainingVideoAdmin.controller');

const router = express.Router();
const adminAuth = [authenticateToken, requireRole('admin', 'super_admin')];

router.get('/', ...adminAuth, controller.listVideos);
router.get('/:id', ...adminAuth, controller.getVideoById);
router.post('/', ...adminAuth, controller.createVideo);
router.put('/:id', ...adminAuth, controller.updateVideo);
router.delete('/:id', ...adminAuth, controller.deleteVideo);

module.exports = router;
