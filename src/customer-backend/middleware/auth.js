const jwt = require('jsonwebtoken');
const { CustomerUser } = require('../models/CustomerUser');

const JWT_SECRET = process.env.CUSTOMER_JWT_SECRET || process.env.JWT_SECRET || 'dev_jwt_secret_change_in_prod';

async function auth(req, res, next) {
  try {
    const authHeader = req.headers.authorization || req.headers.Authorization;
    if (!authHeader) {
      res.status(401).json({ success: false, message: 'Authorization required' });
      return;
    }
    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      res.status(401).json({ success: false, message: 'Invalid authorization format' });
      return;
    }
    const token = parts[1];
    let payload;
    try {
      payload = jwt.verify(token, JWT_SECRET);
    } catch (err) {
      res.status(401).json({ success: false, message: 'Invalid token' });
      return;
    }
    if (!payload || !payload.sub) {
      res.status(401).json({ success: false, message: 'Invalid token payload' });
      return;
    }
    req.user = { _id: payload.sub };
    try {
      const user = await CustomerUser.findById(payload.sub).lean();
      if (user) {
        if (user.status === 'blocked') {
          res.status(403).json({ success: false, message: 'Your account has been blocked. Please contact support.' });
          return;
        }
        req.user.profile = user;
      }
    } catch {
      // ignore
    }
    next();
  } catch (err) {
    console.error('auth middleware error', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
}

module.exports = auth;
