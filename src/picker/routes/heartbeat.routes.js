/**
 * Picker Heartbeat routes
 * POST /api/v1/picker/heartbeat — requires picker JWT
 */
const express = require('express');
const { requireAuth } = require('../middlewares/auth.middleware');
const { postHeartbeat } = require('../controllers/heartbeat.controller');

const router = express.Router();

router.post('/', requireAuth, postHeartbeat);

module.exports = router;
