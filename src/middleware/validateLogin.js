const { body, validationResult } = require('express-validator');

const DASHBOARD_ROLES = ['darkstore', 'production', 'merch', 'rider', 'finance', 'vendor', 'warehouse', 'admin', 'super_admin'];

const loginValidation = [
  body('email')
    .trim()
    .notEmpty()
    .withMessage('Email is required')
    .isEmail()
    .withMessage('Invalid email format')
    .isLength({ max: 255 })
    .withMessage('Email too long'),
  body('password')
    .notEmpty()
    .withMessage('Password is required')
    .isLength({ max: 256 })
    .withMessage('Password too long'),
  body('role')
    .optional()
    .trim()
    .isIn(DASHBOARD_ROLES)
    .withMessage(`Role must be one of: ${DASHBOARD_ROLES.join(', ')}`),
];

/**
 * Middleware: run login validation and respond 400 if invalid.
 * Use after loginValidation.
 */
function handleLoginValidation(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const first = errors.array()[0];
    return res.status(400).json({
      success: false,
      code: 400,
      message: first.msg,
      errors: errors.array().map(e => ({ field: e.path, message: e.msg })),
    });
  }
  next();
}

const loginLockout = require('../core/services/loginLockout');

/**
 * Middleware: block login if account is locked due to too many failed attempts.
 * Use after handleLoginValidation (so req.body.email is present).
 * Returns 429 with Retry-After when locked.
 */
function checkLoginLockout(req, res, next) {
  const email = req.body && req.body.email;
  const { locked, retryAfterSeconds } = loginLockout.isLocked(email);
  if (locked && retryAfterSeconds != null) {
    res.set('Retry-After', String(Math.ceil(retryAfterSeconds)));
    return res.status(429).json({
      success: false,
      code: 429,
      message: 'Too many failed login attempts. This account is temporarily locked. Please try again later.',
      retryAfterSeconds: Math.ceil(retryAfterSeconds),
    });
  }
  next();
}

module.exports = {
  loginValidation,
  handleLoginValidation,
  checkLoginLockout,
};
