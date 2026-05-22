const { Router } = require('express');
const { getConfig, getTerms, getPrivacy } = require('../controllers/legalController');

const router = Router();
router.get('/config', getConfig);
router.get('/terms', getTerms);
router.get('/privacy', getPrivacy);

module.exports = router;
