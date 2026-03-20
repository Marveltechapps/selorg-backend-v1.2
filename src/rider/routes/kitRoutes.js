const express = require('express');
const router = express.Router();
const kitController = require('../controllers/kit.controller');

// Public route for the rider app
router.get('/config', kitController.getKitConfig);

// Public route for training videos (for rider app)
router.get('/training-videos', kitController.getTrainingVideos);

// Admin route to manage the kit config
router.post('/config', kitController.updateKitConfig);

module.exports = router;
