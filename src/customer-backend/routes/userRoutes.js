const { Router } = require('express');
const { getProfile, updateProfile, changePassword, uploadAvatar } = require('../controllers/userController');
const { sendLinkPhoneOtp, verifyLinkPhoneOtp, resendOtp } = require('../controllers/authController');
const auth = require('../middleware/auth');

const router = Router();
router.get('/profile', auth, getProfile);
router.put('/profile', auth, updateProfile);
router.post('/profile/avatar', auth, uploadAvatar);
router.put('/change-password', auth, changePassword);

/** Link / verify phone for email (and other) accounts that lack a verified number */
router.post('/phone/send-otp', auth, sendLinkPhoneOtp);
router.post('/phone/verify-otp', auth, verifyLinkPhoneOtp);
router.post('/phone/resend-otp', auth, resendOtp);

module.exports = router;
