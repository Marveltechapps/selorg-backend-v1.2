const express = require('express');
const router = express.Router();
const { getDeliveryEstimate, getDeliveryFee } = require('../controllers/deliveryController');
const { optionalAuth } = require('../middleware/optionalAuth');

router.get('/estimate', optionalAuth, getDeliveryEstimate);
router.get('/fee', optionalAuth, getDeliveryFee);

module.exports = router;
