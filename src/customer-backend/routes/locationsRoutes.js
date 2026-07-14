const { Router } = require('express');
const { optionalAuth } = require('../middleware/optionalAuth');
const { suggestions, approximate } = require('../controllers/locationsController');

const router = Router();
router.get('/suggestions', optionalAuth, suggestions);
router.get('/approximate', optionalAuth, approximate);

module.exports = router;
