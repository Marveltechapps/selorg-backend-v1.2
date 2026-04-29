'use strict';

const express = require('express');
const { requireAuth } = require('../middlewares/auth.middleware');
const diditController = require('../controllers/didit.controller');

const router = express.Router();

// Authenticated routes
router.post('/session', requireAuth, diditController.createSession);
router.get('/status', requireAuth, diditController.getStatus);

// Unauthenticated webhook – called by Didit's servers
router.post('/webhook', diditController.handleWebhook);

module.exports = router;
