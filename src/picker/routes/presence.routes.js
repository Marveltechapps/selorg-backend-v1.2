const express = require('express');
const { requireAuth } = require('../middlewares/auth.middleware');
const presenceController = require('../controllers/presence.controller');

const router = express.Router();

router.post('/ping', requireAuth, presenceController.postPing);

module.exports = router;
