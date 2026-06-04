'use strict';

const express = require('express');
const { requireAuth } = require('../middlewares/auth.middleware');
const approvalController = require('../controllers/approval.controller');

const router = express.Router();

router.post('/verify-location-otp', requireAuth, approvalController.verifyLocationOtp);

module.exports = router;
