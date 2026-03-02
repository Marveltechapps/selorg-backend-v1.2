const authService = require('../services/authService');
const { logAuthEvent } = require('../../core/services/auditAuth');
const loginLockout = require('../../core/services/loginLockout');

async function register(req, res, next) {
  try {
    const payload = req.body;
    const created = await authService.registerUser(payload);
    res.status(201).json(created);
  } catch (err) {
    next(err);
  }
}

async function login(req, res, next) {
  try {
    const { email, password, role } = req.body;
    const result = await authService.authenticateUser(email, password, role);
    if (!result) {
      loginLockout.recordFailure(email);
      await logAuthEvent({
        module: 'auth',
        action: 'login_failure',
        severity: 'warning',
        userId: null,
        details: { email: email?.substring(0, 3) + '***', role: role || 'vendor' },
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
}

module.exports = { register, login };

