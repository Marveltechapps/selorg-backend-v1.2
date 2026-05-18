/**
 * Centralized Error Handler Middleware — Phase A
 * 
 * Catches all errors and returns standardized error responses.
 * Apply LAST in middleware chain.
 * 
 * Usage in app.js:
 *   app.use(errorHandlerMiddleware);
 */

const ResponseFormatter = require('../utils/ResponseFormatter');
const { applyCorsHeadersIfAllowed } = require('../../middleware/cors.middleware');

class AppError extends Error {
  constructor(message, statusCode = 500, details = null) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
  }
}

const errorHandlerMiddleware = (err, req, res, next) => {
  applyCorsHeadersIfAllowed(req, res);
  const isDevelopment = process.env.NODE_ENV === 'development';

  // Default error
  let error = {
    message: err.message || 'Internal server error',
    statusCode: err.statusCode || 500,
    details: null,
  };

  // Handle specific error types
  if (err.name === 'ValidationError') {
    // Mongoose validation error
    const validationErrors = Object.entries(err.errors || {}).map(([field, err]) => ({
      field,
      message: err.message,
    }));
    return res.status(422).json(
      ResponseFormatter.validationError(validationErrors, 'Validation failed')
    );
  }

  if (err.name === 'CastError') {
    // MongoDB Cast error (invalid ID)
    error.message = `Invalid ${err.kind}: ${err.value}`;
    error.statusCode = 400;
  }

  if (err.code === 11000) {
    // MongoDB duplicate key error
    const field = Object.keys(err.keyValue || {})[0] || 'field';
    error.message = `${field} already exists`;
    error.statusCode = 409;
  }

  if (err.name === 'UnauthorizedError') {
    // JWT errors
    error.message = 'Invalid or expired token';
    error.statusCode = 401;
  }

  if (err.name === 'JsonWebTokenError') {
    error.message = 'Invalid token';
    error.statusCode = 401;
  }

  if (err.name === 'TokenExpiredError') {
    error.message = 'Token expired';
    error.statusCode = 401;
  }

  // Log error (can be extended to Sentry in Phase A Week 4)
  console.error('[ERROR]', {
    timestamp: new Date().toISOString(),
    url: req.url,
    method: req.method,
    statusCode: error.statusCode,
    message: error.message,
    userId: req.user?._id,
    stack: isDevelopment ? err.stack : undefined,
  });

  // Sanitize error details based on environment
  if (isDevelopment) {
    error.details = {
      stack: err.stack,
      name: err.name,
      ...(err.details && { validationDetails: err.details }),
    };
  }

  // Send response
  const response = ResponseFormatter.error(
    error.message,
    error.statusCode,
    {
      error: {
        code: error.statusCode,
        message: error.message,
        details: error.details,
      },
    }
  );

  res.status(error.statusCode).json(response);
};

// Not Found middleware (404)
const notFoundMiddleware = (req, res, next) => {
  const response = ResponseFormatter.notFound('Route', req.url);
  res.status(404).json(response);
};

module.exports = {
  errorHandlerMiddleware,
  notFoundMiddleware,
  AppError,
};
