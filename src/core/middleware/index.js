/**
 * CommonJS wrapper for core middleware
 * Provides compatibility for JavaScript files that use require()
 */

const { authenticateToken, requireAuth, requireRole, requirePermission, validateJWTSecret } = require('./auth.middleware');
const { errorHandler, asyncHandler } = require('./errorHandler.middleware');
const { requestIdMiddleware } = require('./requestId.middleware');
const { requestLoggerMiddleware } = require('./requestLogger.middleware');
const { cacheMiddleware } = require('./cache.middleware');

// Export for CommonJS
module.exports = {
  authenticateToken,
  requireAuth,
  authenticate: authenticateToken, // Alias for backward compatibility
  requireRole,
  requirePermission,
  validateJWTSecret,
  errorHandler,
  asyncHandler,
  requestIdMiddleware,
  requestLoggerMiddleware,
  cacheMiddleware,
};
