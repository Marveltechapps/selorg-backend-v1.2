/**
 * Auth middleware – from frontend YAML (Bearer JWT).
 * Sets req.userId from X-User-Id (dev) or Authorization Bearer JWT.
 */
const jwt = require('jsonwebtoken');
const { error } = require('../utils/response.util');

const JWT_SECRET = process.env.JWT_SECRET || 'picker-app-secret-change-in-production';

const optionalAuth = (req, res, next) => {
  const header = req.headers.authorization;
  const xUserId = req.headers['x-user-id'];
  if (xUserId) {
    req.userId = xUserId;
    return next();
  }
  if (header && header.startsWith('Bearer ')) {
    const token = header.slice(7);
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      req.userId = decoded.sub || decoded.userId || decoded.id;
    } catch (_) {
      try {
        const payload = JSON.parse(Buffer.from(token.split('.')[1] || '{}', 'base64').toString());
        req.userId = payload.sub || payload.userId || payload.id;
      } catch (__) {
        req.userId = token;
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
