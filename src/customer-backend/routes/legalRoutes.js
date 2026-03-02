const { Router } = require('express');
const auth = require('../middleware/auth');
const { getConfig, getTerms, getPrivacy, accept } = require('../controllers/legalController');

const router = Router();
router.get('/config', getConfig);
router.get('/terms', getTerms);
router.get('/privacy', getPrivacy);
router.post('/accept', auth, accept);
module.exports = router;
