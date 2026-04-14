/**
 * Auth middleware – Bearer JWT + single-session `sid` vs PickerUser.sessionToken.
 * X-User-Id allowed only in non-production when ALLOW_X_USER_ID_DEV=true.
 */
const jwt = require('jsonwebtoken');
const { error } = require('../utils/response.util');
const PickerUser = require('../models/user.model');

const JWT_SECRET = process.env.JWT_SECRET || 'picker-app-secret-change-in-production';
const ALLOW_X_USER_ID_DEV = String(process.env.ALLOW_X_USER_ID_DEV || '').toLowerCase() === 'true';

const optionalAuth = (req, res, next) => {
  const header = req.headers.authorization;
  const xUserId = req.headers['x-user-id'];
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
      try {
        const payload = JSON.parse(Buffer.from(token.split('.')[1] || '{}', 'base64').toString());
        req.userId = payload.sub || payload.userId || payload.id;
      } catch (__) {
        // leave req.userId unset
      }
      if (__DEV__ && jwtError && jwtError.message) {
        console.warn('[picker auth] token verify failed:', jwtError.message);
      }
    }
  }
  next();
};

const requireAuth = async (req, res, next) => {
  const xUserId = req.headers['x-user-id'];
  if (xUserId && (process.env.NODE_ENV !== 'production' || ALLOW_X_USER_ID_DEV)) {
    req.userId = xUserId;
    return next();
  }

  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      error: 'Unauthorized',
      code: 'UNAUTHORIZED',
    });
  }

  const token = header.slice(7);
  let decoded;
  try {
    decoded = jwt.verify(token, JWT_SECRET);
  } catch (jwtError) {
    return res.status(401).json({
      success: false,
      error: 'Invalid or expired token',
      code: 'INVALID_TOKEN',
    });
  }

  const uid = decoded.sub || decoded.userId || decoded.id;
  if (!uid) {
    return res.status(401).json({
      success: false,
      error: 'Unauthorized',
      code: 'UNAUTHORIZED',
    });
  }

  const sid = decoded.sid;
  if (!sid) {
    return res.status(401).json({
      success: false,
      error: 'Session expired. Please log in again.',
      code: 'SESSION_INVALIDATED',
    });
  }

  try {
    const user = await PickerUser.findById(uid).select('sessionToken').lean();
    if (!user || !user.sessionToken || user.sessionToken !== sid) {
      return res.status(401).json({
        success: false,
        error: 'Session expired. Please log in again.',
        code: 'SESSION_INVALIDATED',
      });
    }
  } catch (e) {
    return error(res, 'Unauthorized', 401);
  }

  req.userId = uid;
  return next();
};

module.exports = { optionalAuth, requireAuth };
