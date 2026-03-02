/**
 * PushToken routes – from frontend YAML (application-spec POST /api/push-tokens).
 */
const express = require('express');
const pushTokenController = require('../controllers/pushToken.controller');

const router = express.Router();

router.post('/', pushTokenController.register);

module.exports = router;
