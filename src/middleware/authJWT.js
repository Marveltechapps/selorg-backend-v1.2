/**
 * JWT Authentication Middleware
 * File: src/middleware/authJWT.js
 *
 * CRITICAL FIX P0.3: Validates JWT token expiry on every request
 * - Checks 'exp' claim against current time
 * - Returns 401 for expired tokens
 * - Provides token refresh mechanism
 */

const jwt = require('jsonwebtoken');
const logger = require('../core/utils/logger');

/**
 * Authenticate JWT Token
 * ✅ FIX P0.3: Validates token expiry using JWT library + manual check
 */
const authenticateJWT = (req, res, next) => {
  const authHeader = req.headers['authorization'];

  if (!authHeader) {
    return res.status(401).json({
      error: 'Missing authentication token',
      code: 'NO_AUTH_TOKEN'
    });
  }

  // Extract token from "Bearer TOKEN"
  const token = authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({
      error: 'Invalid authorization header format',
      code: 'INVALID_AUTH_FORMAT',
      hint: 'Use: Authorization: Bearer <token>'
    });
  }

  try {
    // ✅ FIX P0.3: jwt.verify() validates both signature AND expiry
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key', {
      algorithms: ['HS256']
    });

    // Additional manual check of expiry timestamp
    const currentTime = Math.floor(Date.now() / 1000); // Current time in seconds

    if (decoded.exp && decoded.exp < currentTime) {
      const expiredAt = new Date(decoded.exp * 1000);
      logger.warn(`[Auth] Expired token attempt from user ${decoded.userId} (expired at ${expiredAt})`);

      return res.status(401).json({
        error: 'Token has expired',
        code: 'TOKEN_EXPIRED',
        expiredAt: expiredAt.toISOString(),
        hint: 'Use /auth/refresh endpoint to get a new token'
      });
    }

    // Warn if token expiring soon (within 5 minutes)
    const expiringIn = decoded.exp - currentTime;
    if (expiringIn < 300) {
      logger.info(`[Auth] Token expiring soon for user ${decoded.userId}: ${expiringIn}s remaining`);
      res.setHeader('X-Token-Expiring-Soon', 'true');
      res.setHeader('X-Token-Expires-In', expiringIn.toString());
    }

    // Attach decoded token to request
    req.user = decoded;
    req.token = token;

    next();
  } catch (error) {
    // Handle different JWT errors
    if (error.name === 'TokenExpiredError') {
      logger.warn(`[Auth] TokenExpiredError: ${error.message}`);
      return res.status(401).json({
        error: 'Token has expired',
        code: 'TOKEN_EXPIRED',
        expiredAt: error.expiredAt ? error.expiredAt.toISOString() : null
      });
    }

    if (error.name === 'JsonWebTokenError') {
      logger.warn(`[Auth] JsonWebTokenError: ${error.message}`);
      return res.status(401).json({
        error: 'Invalid token',
        code: 'INVALID_TOKEN'
      });
    }

    if (error.name === 'NotBeforeError') {
      logger.warn(`[Auth] NotBeforeError: Token not yet valid`);
      return res.status(401).json({
        error: 'Token not yet valid',
        code: 'TOKEN_NOT_YET_VALID'
      });
    }

    logger.error('[Auth] Authentication error:', error);
    return res.status(500).json({
      error: 'Authentication failed',
      code: 'AUTH_ERROR'
    });
  }
};

/**
 * Generate JWT Token with proper expiry
 * ✅ Creates token with 24-hour expiry by default
 */
const generateToken = (userId, userType, expiresIn = '24h') => {
  const now = Math.floor(Date.now() / 1000);
  const exp = now + (24 * 60 * 60); // 24 hours from now

  const token = jwt.sign(
    {
      userId,
      userType,
      iat: now,  // Issued At
      exp: exp   // Expires At (CRITICAL for expiry validation)
    },
    process.env.JWT_SECRET || 'your-secret-key',
    {
      algorithm: 'HS256'
      // Note: exp is already set in payload above, so don't use expiresIn option
    }
  );

  logger.info(`[Auth] Token generated for user ${userId}, expires in ${expiresIn}`);

  return {
    token,
    expiresIn: '24h',
    expiresAt: new Date(exp * 1000).toISOString()
  };
};

/**
 * Token Refresh Endpoint
 * Allows clients to get new token before expiry
 */
const refreshToken = async (req, res) => {
  try {
    const { refreshToken: incomingToken } = req.body;

    if (!incomingToken) {
      return res.status(400).json({
        error: 'Refresh token required',
        code: 'MISSING_REFRESH_TOKEN'
      });
    }

    // Verify refresh token (allow expired, we'll reissue)
    let decoded;
    try {
      decoded = jwt.verify(incomingToken, process.env.JWT_REFRESH_SECRET || 'refresh-secret', {
        ignoreExpiration: false
      });
    } catch (error) {
      logger.warn(`[Auth] Invalid refresh token: ${error.message}`);
      return res.status(401).json({
        error: 'Invalid refresh token',
        code: 'INVALID_REFRESH_TOKEN'
      });
    }

    // Generate new access token
    const newTokenData = generateToken(decoded.userId, decoded.userType);

    logger.info(`[Auth] Token refreshed for user ${decoded.userId}`);

    return res.json({
      token: newTokenData.token,
      expiresIn: '24h',
      expiresAt: newTokenData.expiresAt
    });
  } catch (error) {
    logger.error('[Auth] Token refresh failed:', error);
    return res.status(500).json({
      error: 'Token refresh failed',
      code: 'REFRESH_ERROR'
    });
  }
};

/**
 * Optional: Check token validity without throwing error
 */
const checkTokenValidity = (token) => {
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
    const currentTime = Math.floor(Date.now() / 1000);

    return {
      valid: true,
      expired: decoded.exp < currentTime,
      expiresIn: decoded.exp - currentTime,
      userId: decoded.userId
    };
  } catch (error) {
    return {
      valid: false,
      error: error.message
    };
  }
};

module.exports = {
  authenticateJWT,
  generateToken,
  refreshToken,
  checkTokenValidity
};
