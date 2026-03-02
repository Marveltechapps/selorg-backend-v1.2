const express = require('express');
const router = express.Router();
const webhooksController = require('../controllers/webhooksController');

router.post('/vendor-signed', webhooksController.vendorSigned);
router.post('/carrier', webhooksController.carrierWebhook);

module.exports = router;

