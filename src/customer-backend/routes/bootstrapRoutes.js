const { Router } = require('express');
const { optionalAuth } = require('../middleware/optionalAuth');
const { getBootstrap } = require('../controllers/bootstrapController');

const router = Router();
router.get('/', optionalAuth, getBootstrap);
module.exports = router;
