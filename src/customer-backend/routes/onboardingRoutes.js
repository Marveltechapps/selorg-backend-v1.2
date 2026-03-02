const { Router } = require('express');
const { optionalAuth } = require('../middleware/optionalAuth');
const { getPages, getPageByNumber, completeOnboarding, getStatus } = require('../controllers/onboardingController');

const router = Router();
router.get('/pages', getPages);
router.get('/pages/:pageNumber', getPageByNumber);
router.post('/complete', optionalAuth, completeOnboarding);
router.get('/status', optionalAuth, getStatus);
module.exports = router;
