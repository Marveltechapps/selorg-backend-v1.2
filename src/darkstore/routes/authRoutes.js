const express = require('express');
const router = express.Router();
const authService = require('../../vendor/services/authService');
const { authenticateToken } = require('../../core/middleware/auth.middleware');
const { authLimiter } = require('../../middleware/rateLimiter');
const { loginValidation, handleLoginValidation, checkLoginLockout } = require('../../middleware/validateLogin');
const loginLockout = require('../../core/services/loginLockout');
const { logout } = require('../../core/controllers/logoutController');
const { logAuthEvent } = require('../../core/services/auditAuth');

// Registration removed: dashboard access is company-issued credentials only.

router.post('/login', authLimiter, loginValidation, handleLoginValidation, checkLoginLockout, async (req, res, next) => {
  try {
    const { email, password, role } = req.body;
    const result = await authService.authenticateUser(email, password, role || 'darkstore');
    if (!result) {
      loginLockout.recordFailure(email);
      await logAuthEvent({
        module: 'auth',
        action: 'login_failure',
        severity: 'warning',
        userId: null,
        details: { email: email?.substring(0, 3) + '***', role: role || 'darkstore' },
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
    res.json({
      ...result,
      assignedStores: result.user?.assignedStores || [],
      primaryStoreId: result.user?.primaryStoreId || '',
    });
  } catch (err) {
    next(err);
  }
});

router.get('/me', authenticateToken, async (req, res) => {
  res.json({
    user: {
      id: req.user.userId,
      email: req.user.email,
      role: req.user.role,
      name: req.user.name,
      assignedStores: req.user.assignedStores,
      primaryStoreId: req.user.primaryStoreId,
    },
  });
});

router.post('/logout', logout);

module.exports = router;
