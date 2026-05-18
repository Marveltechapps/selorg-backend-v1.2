/**
 * CommonJS wrapper for core middleware
 * Provides compatibility for JavaScript files that use require()
 */

const { authenticateToken, requireAuth, requireRole, requirePermission, validateJWTSecret } = require('./auth.middleware');
const {
  errorHandlerMiddleware,
  notFoundMiddleware,
  AppError,
} = require('./errorHandler.middleware');
const asyncHandler = require('../../middleware/asyncHandler');
const { requestIdMiddleware } = require('./requestId.middleware');
const { requestLoggerMiddleware } = require('./requestLogger.middleware');
const { cacheMiddleware } = require('./cache.middleware');
const { apiEnvelopeMiddleware } = require('./apiEnvelope.middleware');

// Export for CommonJS
module.exports = {
  authenticateToken,
  requireAuth,
  authenticate: authenticateToken, // Alias for backward compatibility
  requireRole,
  requirePermission,
  validateJWTSecret,
  errorHandler: errorHandlerMiddleware,
  errorHandlerMiddleware,
  notFoundMiddleware,
  AppError,
  asyncHandler,
  requestIdMiddleware,
  requestLoggerMiddleware,
  cacheMiddleware,
  apiEnvelopeMiddleware,
};
