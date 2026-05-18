/**
 * Role-Based Authorization Middleware
 * File: src/middleware/roleAuth.middleware.js
 *
 * P2.1: Validates user type and enforces role-based access control
 * - Checks JWT payload for userType (CUSTOMER, PICKER, RIDER)
 * - Returns 403 if user lacks required role
 * - Allows multiple allowed roles per endpoint
 */

const logger = require('../core/utils/logger');

/**
 * Create role authorization middleware
 * Usage: app.use('/api/v1/picker/*', authorizeRole(['PICKER']))
 */
const authorizeRole = (allowedRoles = []) => {
  return (req, res, next) => {
    // Expect req.user to be set by authenticateJWT middleware
    if (!req.user) {
      logger.warn('[Auth] No user context found in request');
      return res.status(401).json({
        error: 'Authentication required',
        code: 'NO_USER_CONTEXT'
      });
    }

    const userType = req.user.userType || req.user.role;

    if (!userType) {
      logger.warn(`[Auth] User ${req.user.userId} has no userType claim`);
      return res.status(401).json({
        error: 'User type not specified',
        code: 'MISSING_USER_TYPE'
      });
    }

    // Normalize to uppercase
    const normalizedUserType = userType.toUpperCase();

    // Check if user's type is in allowed roles
    if (allowedRoles.length > 0 && !allowedRoles.includes(normalizedUserType)) {
      logger.warn(
        `[Auth] Access denied for user ${req.user.userId} (type: ${normalizedUserType}) to ${req.path}. Required: ${allowedRoles.join(',')}`
      );

      return res.status(403).json({
        error: 'Access denied',
        code: 'INSUFFICIENT_PERMISSIONS',
        requiredRoles: allowedRoles,
        userType: normalizedUserType
      });
    }

    // Attach normalized userType to request for consistency
    req.user.userType = normalizedUserType;

    logger.info(
      `[Auth] Access granted for user ${req.user.userId} (${normalizedUserType}) to ${req.method} ${req.path}`
    );

    next();
  };
};

/**
 * Middleware factory for single role
 */
const requireRole = (role) => {
  return authorizeRole([role.toUpperCase()]);
};

/**
 * Middleware factory for multiple roles
 */
const requireAnyRole = (roles) => {
  return authorizeRole(roles.map((r) => r.toUpperCase()));
};

module.exports = {
  authorizeRole,
  requireRole,
  requireAnyRole
};
