const jwt = require('jsonwebtoken');
const { ErrorResponse } = require('../utils/ErrorResponse');
const HHDUser = require('../models/User.model');

async function protect(req, res, next) {
  try {
    let token;
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }
    if (!token) {
      throw new ErrorResponse('Not authorized to access this route', 401);
    }
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || '');
      const user = await HHDUser.findById(decoded.id).select('-password');
      if (!user) throw new ErrorResponse('User not found', 404);
      req.user = {
        id: user._id.toString(),
        mobile: user.mobile,
        role: user.role,
      };
      next();
    } catch (e) {
      throw new ErrorResponse('Not authorized to access this route', 401);
    }
  } catch (error) {
    next(error);
  }
}

function authorize(...roles) {
  return (req, res, next) => {
    if (!req.user) throw new ErrorResponse('Not authorized to access this route', 401);
    if (!roles.includes(req.user.role)) {
      throw new ErrorResponse(`User role '${req.user.role}' is not authorized to access this route`, 403);
    }
    next();
  };
}

module.exports = { protect, authorize };
