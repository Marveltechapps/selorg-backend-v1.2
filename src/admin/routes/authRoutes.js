const express = require('express');
const authService = require('../services/authService');
const { authLimiter } = require('../../middleware/rateLimiter');
const { loginValidation, handleLoginValidation, checkLoginLockout } = require('../../middleware/validateLogin');
const loginLockout = require('../../core/services/loginLockout');
const { logout } = require('../../core/controllers/logoutController');
const { logAuthEvent } = require('../../core/services/auditAuth');

const router = express.Router();

// Registration removed: dashboard access is company-issued credentials only.

router.post('/login', authLimiter, loginValidation, handleLoginValidation, checkLoginLockout, async (req, res, next) => {
  try {
    const { email, password, role } = req.body;
    console.log('Login request:', { email, role: role || 'admin' });

    if (!email || !password) {
      return res.status(400).json({
        code: 400,
        message: 'Email and password are required',
      });
    }

    const result = await authService.authenticateUser(email, password, role || 'admin');

    if (!result) {
      loginLockout.recordFailure(email);
      await logAuthEvent({
        module: 'auth',
        action: 'login_failure',
        severity: 'warning',
        userId: null,
        details: { email: email?.substring(0, 3) + '***', role: role || 'admin' },
        req,
      });
      return res.status(401).json({
        code: 401,
        message: 'Invalid credentials. Please check your email and password.',
      });
    }

    loginLockout.clearAttempts(email);
    await logAuthEvent({
      module: 'auth',
      action: 'login_success',
      severity: 'info',
      userId: result.user?._id || result.user?.id,
      details: { email: result.user?.email, role: result.user?.role },
      req,
    });
    res.json(result);
  } catch (err) {
    console.error('Login error:', err);
    next(err);
  }
});

router.post('/logout', logout);

module.exports = router;
