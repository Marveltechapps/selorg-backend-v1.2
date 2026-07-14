const { Router } = require('express');
const auth = require('../middleware/auth');
const { getConfig, getTerms, getPrivacy, getLicense, accept } = require('../controllers/legalController');

const router = Router();
router.get('/config', getConfig);
router.get('/terms', getTerms);
router.get('/privacy', getPrivacy);
router.get('/license', getLicense);
router.post('/accept', auth, accept);
module.exports = router;
