/**
 * Custom error response class for consistent error handling
 * Extends native Error with statusCode for HTTP responses
 */
class ErrorResponse extends Error {
  constructor(message, statusCode, code, details) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.name = 'ErrorResponse';

    // Maintains proper stack trace for where error was thrown
    Error.captureStackTrace(this, this.constructor);
  }
}

// CommonJS export for backward compatibility
module.exports = ErrorResponse;