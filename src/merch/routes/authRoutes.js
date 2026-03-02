const express = require('express');
const authService = require('../../vendor/services/authService');
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
    const result = await authService.authenticateUser(email, password, role || 'merch');
    if (!result) {
      loginLockout.recordFailure(email);
      await logAuthEvent({
        module: 'auth',
        action: 'login_failure',
        severity: 'warning',
        userId: null,
        details: { email: email?.substring(0, 3) + '***', role: role || 'merch' },
        req,
      });
      return res.status(401).json({ code: 401, message: 'Invalid credentials' });
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
    next(err);
  }
});

router.post('/logout', logout);

module.exports = router;
