/**
 * Training routes – Enhanced with video management and watch-time tracking.
 * Phase 1 RBAC: Dashboard endpoints for training video CRUD will require Admin role.
 */
const express = require('express');
const trainingController = require('../controllers/training.controller');
const { requireAuth } = require('../middlewares/auth.middleware');

const router = express.Router();

// New endpoints for video management
router.get('/videos', requireAuth, trainingController.getVideos);
router.get('/videos/:videoId', requireAuth, trainingController.getVideoById);

// Progress tracking endpoints
router.put('/watch-progress', requireAuth, trainingController.trackWatchProgress);
router.post('/complete/:videoId', requireAuth, trainingController.completeVideo);
router.post('/modules/:moduleId/complete', requireAuth, trainingController.completeModule);

// User progress endpoint
router.get('/user-progress', requireAuth, trainingController.getUserProgress);

// Legacy endpoints (backward compatibility)
router.get('/progress', requireAuth, trainingController.getProgress);
router.put('/progress', requireAuth, trainingController.updateProgress);

// Final assessment
router.post('/assessment', requireAuth, trainingController.submitAssessment);

module.exports = router;
