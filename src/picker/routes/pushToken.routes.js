/**
 * PushToken routes – from frontend YAML (application-spec POST /api/push-tokens).
 */
const express = require('express');
const pushTokenController = require('../controllers/pushToken.controller');
const { requireAuth } = require('../middlewares/auth.middleware');

const router = express.Router();

router.post('/', requireAuth, pushTokenController.register);

module.exports = router;
