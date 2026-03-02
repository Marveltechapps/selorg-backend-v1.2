/**
 * Auth routes – from backend-workflow.yaml (auth_send_otp, auth_verify_otp).
 */
const express = require('express');
const authController = require('../controllers/auth.controller');

const router = express.Router();

router.post('/send-otp', authController.sendOtp);
router.post('/resend-otp', authController.resendOtp);
router.post('/verify-otp', authController.verifyOtp);

module.exports = router;
