const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const { CustomerUser } = require('../models/CustomerUser');

const JWT_SECRET =
  process.env.CUSTOMER_JWT_SECRET || process.env.JWT_SECRET || 'dev_jwt_secret_change_in_prod';

/**
 * Attaches req.user when a valid customer JWT is present.
 * Missing or invalid tokens are ignored so public routes stay reachable.
 */
async function optionalAuth(req, _res, next) {
  req.user = undefined;
  try {
    const authHeader = req.headers.authorization || req.headers.Authorization;
    if (!authHeader) {
      next();
      return;
    }
    const parts = String(authHeader).split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer' || !parts[1]) {
      next();
      return;
    }
    let payload;
    try {
      payload = jwt.verify(parts[1], JWT_SECRET);
    } catch {
      next();
      return;
    }
    if (!payload?.sub || !mongoose.Types.ObjectId.isValid(String(payload.sub))) {
      next();
      return;
    }
    req.user = { _id: String(payload.sub) };
    try {
      const user = await CustomerUser.findById(payload.sub).lean();
      if (user) {
        if (user.status === 'blocked') {
          req.user = undefined;
          next();
          return;
        }
        req.user.profile = user;
      }
    } catch {
      // profile enrichment is best-effort
    }
    next();
  } catch (err) {
    console.error('optionalAuth middleware error', err);
    req.user = undefined;
    next();
  }
}

module.exports = { optionalAuth };
