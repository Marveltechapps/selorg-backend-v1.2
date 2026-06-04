const express = require('express');
const { requireAuth } = require('../middlewares/auth.middleware');
const darkStoreLoginController = require('../controllers/darkStoreLogin.controller');

const router = express.Router();

/** POST /auth/dark-store-login — register at dark store after phone OTP login */
router.post('/dark-store-login', requireAuth, darkStoreLoginController.registerAtDarkStore);

/** GET /auth/store-otp?storeId= — retrieve permanent OTP for a store */
router.get('/store-otp', requireAuth, darkStoreLoginController.getPermanentOtp);

module.exports = router;
