const { Router } = require('express');
const { sendOtp, verifyOtpController, resendOtp } = require('../controllers/authController');

const router = Router();
router.post('/send-otp', sendOtp);
router.post('/verify-otp', verifyOtpController);
router.post('/resend-otp', resendOtp);
module.exports = router;
