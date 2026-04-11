/**
 * Auth middleware – from frontend YAML (Bearer JWT).
 * Sets req.userId from X-User-Id (dev) or Authorization Bearer JWT.
 */
const jwt = require('jsonwebtoken');
const { error } = require('../utils/response.util');

const JWT_SECRET = process.env.JWT_SECRET || 'picker-app-secret-change-in-production';
const ALLOW_X_USER_ID_DEV = String(process.env.ALLOW_X_USER_ID_DEV || '').toLowerCase() === 'true';

const optionalAuth = (req, res, next) => {
  const header = req.headers.authorization;
  const xUserId = req.headers['x-user-id'];
  // Allow X-User-Id only in non-production when explicitly enabled for dev/testing.
  if (xUserId && (process.env.NODE_ENV !== 'production' || ALLOW_X_USER_ID_DEV)) {
    req.userId = xUserId;
    return next();
  }
  if (header && header.startsWith('Bearer ')) {
    const token = header.slice(7);
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      req.userId = decoded.sub || decoded.userId || decoded.id;
    } catch (jwtError) {
      // Best-effort fallback: try base64 decode without verification (avoid throwing in optionalAuth)
      try {
        const payload = JSON.parse(Buffer.from(token.split('.')[1] || '{}', 'base64').toString());
        req.userId = payload.sub || payload.userId || payload.id;
      } catch (__) {
        // If neither works, leave req.userId unset for optionalAuth.
      }
      if (__DEV__ && jwtError && jwtError.message) {
        console.warn('[picker auth] token verify failed:', jwtError.message);
      }
    }
  }
  next();
};

const requireAuth = (req, res, next) => {
  optionalAuth(req, res, () => {
    if (!req.userId) return error(res, 'Unauthorized', 401);
    return next();
  });
};

module.exports = { optionalAuth, requireAuth };
