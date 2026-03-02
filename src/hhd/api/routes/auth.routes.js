const express = require('express');
const { sendOTP, resendOTP, verifyOTP, getMe, logout } = require('../controllers/auth.controller');
const { protect } = require('../../middleware/auth');

const router = express.Router();
router.post('/send-otp', sendOTP);
router.post('/resend-otp', resendOTP);
router.post('/verify-otp', verifyOTP);
router.get('/me', protect, getMe);
router.post('/logout', protect, logout);
module.exports = router;
