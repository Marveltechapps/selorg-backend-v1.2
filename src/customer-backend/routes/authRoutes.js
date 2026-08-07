const { Router } = require('express');
const { sendOtp, verifyOtpController, resendOtp, logout } = require('../controllers/authController');

const router = Router();
router.post('/send-otp', sendOtp);
router.post('/verify-otp', verifyOtpController);
router.post('/resend-otp', resendOtp);
router.post('/logout', logout);
module.exports = router;
