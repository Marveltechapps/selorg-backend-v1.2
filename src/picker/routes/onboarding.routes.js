/**
 * Onboarding routes – GET /onboarding-state (backend-only state for Picker app routing)
 */
const express = require('express');
const onboardingController = require('../controllers/onboarding.controller');
const { requireAuth } = require('../middlewares/auth.middleware');

const router = express.Router();
router.get('/state', requireAuth, onboardingController.getOnboardingState);

module.exports = router;
