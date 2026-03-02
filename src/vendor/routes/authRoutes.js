const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { authLimiter } = require('../../middleware/rateLimiter');
const { loginValidation, handleLoginValidation, checkLoginLockout } = require('../../middleware/validateLogin');
const { logout } = require('../../core/controllers/logoutController');

// Registration removed: dashboard access is company-issued credentials only.
router.post('/login', authLimiter, loginValidation, handleLoginValidation, checkLoginLockout, authController.login);
router.post('/logout', logout);

module.exports = router;

