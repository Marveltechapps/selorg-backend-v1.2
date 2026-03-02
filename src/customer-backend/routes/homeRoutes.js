const { Router } = require('express');
const { optionalAuth } = require('../middleware/optionalAuth');
const { getHome } = require('../controllers/homeController');

const router = Router();
router.get('/', optionalAuth, getHome);
module.exports = router;
