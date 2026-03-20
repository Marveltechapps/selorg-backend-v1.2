const { Router } = require('express');
const { getBannerById } = require('../controllers/bannersController');

const router = Router();
router.get('/:id', getBannerById);
module.exports = router;
