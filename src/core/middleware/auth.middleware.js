const jwt = require('jsonwebtoken');
const logger = require('../utils/logger');
const { ErrorResponse } = require('../utils/ErrorResponse');
const tokenBlocklist = require('../services/tokenBlocklist');

/**
 * Validates JWT secret on startup
 * Throws error if secret is missing or too weak
 */
const validateJWTSecret = () => {
  const jwtSecret = process.env.JWT_SECRET;
  
  if (!jwtSecret) {
    throw new Error(
      'JWT_SECRET environment variable is required. ' +
      'Please set it in your .env file. ' +
      'Generate a secure secret: openssl rand -base64 32'
    );
  }

  if (jwtSecret.length < 32) {
    throw new Error(
      `JWT_SECRET must be at least 32 characters long. ` +
      `Current length: ${jwtSecret.length}. ` +
      `Generate a secure secret: openssl rand -base64 32`
    );
  }
};

/**
 * Authentication middleware
 * Verifies JWT token and attaches user to request object
 * Supports role-based access control (RBAC)
 */
const authenticateToken = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({
        success: false,
        error: {
          code: 'AUTH_TOKEN_REQUIRED',
          message: 'Access token required. Please provide a valid Bearer token.',
        },
        meta: {
          requestId: req.id,
          timestamp: new Date().toISOString(),
        },
      });
      return;
    }

    const token = authHeader.split(' ')[1];
    const jwtSecret = process.env.JWT_SECRET;

    if (!jwtSecret) {
      logger.error('JWT_SECRET not configured');
      throw new Error('Server configuration error');
    }

    try {
      const decoded = jwt.verify(token, jwtSecret);

      if (tokenBlocklist.has(token)) {
        res.status(403).json({
          success: false,
          error: {
            code: 'AUTH_TOKEN_REVOKED',
            message: 'Token has been revoked. Please log in again.',
          },
          meta: {
            requestId: req.id,
            timestamp: new Date().toISOString(),
          },
        });
        return;
      }

      // Attach user to request object
      req.user = {
        userId: decoded.userId || decoded.id || '',
        email: decoded.email,
        roleId: decoded.roleId || decoded.role,
        role: decoded.role,
        name: decoded.name || '',
        permissions: decoded.permissions || [],
        assignedStores: decoded.assignedStores || [],
        primaryStoreId: decoded.primaryStoreId || '',
      };

      next();
    } catch (jwtError) {
      logger.warn('JWT verification failed', {
        error: jwtError.message,
        requestId: req.id,
        path: req.path,
      });

      res.status(403).json({
        success: false,
        error: {
          code: 'AUTH_TOKEN_INVALID',
          message: jwtError.name === 'TokenExpiredError'
            ? 'Token has expired. Please refresh your token.'
            : 'Invalid or malformed token. Please provide a valid token.',
        },
        meta: {
          requestId: req.id,
          timestamp: new Date().toISOString(),
        },
      });
    }
  } catch (error) {
    logger.error('Authentication error', {
      error: error.message,
      stack: error.stack,
      requestId: req.id,
      path: req.path,
    });

    res.status(500).json({
      success: false,
      error: {
        code: 'AUTH_ERROR',
        message: 'Authentication service error',
      },
      meta: {
        requestId: req.id,
        timestamp: new Date().toISOString(),
      },
    });
  }
};

/**
 * Role-based access control middleware
 * Checks if user has required role(s) to access the route
 * Must be used after authenticateToken
 */
const requireRole = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: {
          code: 'AUTH_REQUIRED',
          message: 'Authentication required',
        },
        meta: {
          requestId: req.id,
          timestamp: new Date().toISOString(),
        },
      });
      return;
    }

    const userRole = req.user.role || req.user.roleId;
    const hasAccess = allowedRoles.includes(userRole || '') || 
                     allowedRoles.includes('*') ||
                     req.user.role === 'super_admin';

    if (!hasAccess) {
      logger.warn('Access denied', {
        userId: req.user.userId,
        userRole,
        requiredRoles: allowedRoles,
        path: req.path,
        requestId: req.id,
      });

      res.status(403).json({
        success: false,
        error: {
          code: 'ACCESS_DENIED',
          message: `Access denied. Required role: ${allowedRoles.join(' or ')}`,
        },
        meta: {
          requestId: req.id,
          timestamp: new Date().toISOString(),
        },
      });
      return;
    }

    next();
  };
};

/**
 * Permission-based access control middleware
 * Checks if user has required permission(s)
 * Must be used after authenticateToken
 */
const requirePermission = (...requiredPermissions) => {
  return (req, res, next) => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: {
          code: 'AUTH_REQUIRED',
          message: 'Authentication required',
        },
        meta: {
          requestId: req.id,
          timestamp: new Date().toISOString(),
        },
      });
      return;
    }

    const userPermissions = req.user.permissions || [];
    const hasPermission = requiredPermissions.every(perm => 
      userPermissions.includes(perm) || userPermissions.includes('*')
    );

    if (!hasPermission) {
      logger.warn('Permission denied', {
        userId: req.user.userId,
        userPermissions,
        requiredPermissions,
        path: req.path,
        requestId: req.id,
      });

      res.status(403).json({
        success: false,
        error: {
          code: 'PERMISSION_DENIED',
          message: `Permission denied. Required: ${requiredPermissions.join(', ')}`,
        },
        meta: {
          requestId: req.id,
          timestamp: new Date().toISOString(),
        },
      });
      return;
    }

    next();
  };
};

// Export for backward compatibility
const requireAuth = authenticateToken;

// CommonJS export for backward compatibility
module.exports = {
  authenticateToken,
  requireAuth,
  requireRole,
  requirePermission,
  validateJWTSecret,
};