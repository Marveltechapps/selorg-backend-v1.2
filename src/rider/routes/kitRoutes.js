const express = require('express');
const router = express.Router();
const kitController = require('../controllers/kit.controller');
const { authenticateToken, requireRole } = require('../../core/middleware');

// Public route for the rider app
router.get('/config', kitController.getKitConfig);

// Public route for training videos (for rider app)
router.get('/training-videos', kitController.getTrainingVideos);

// Admin route to manage the kit config
router.post('/config', kitController.updateKitConfig);

// Rider dashboard route(s) to manage training videos (requires dashboard auth)
const riderDashboardAuth = [authenticateToken, requireRole('rider', 'admin', 'super_admin')];
router.post('/training-videos', ...riderDashboardAuth, kitController.createTrainingVideo);
router.put('/training-videos/:id', ...riderDashboardAuth, kitController.updateTrainingVideo);
router.delete('/training-videos/:id', ...riderDashboardAuth, kitController.deleteTrainingVideo);

module.exports = router;
