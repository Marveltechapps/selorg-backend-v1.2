"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.errorHandler = void 0;
var errorHandler = exports.errorHandler = function errorHandler(err, req, res, _next) {
  // Log error with request context
  var errorContext = {
    path: req.path,
    method: req.method,
    query: req.query,
    body: req.body,
    timestamp: new Date().toISOString()
  };
  if (err instanceof Error) {
    console.error("[Error Handler]", err.message, errorContext);

    // Check if it's already a formatted API error
    if ('code' in err && 'error' in err) {
      var apiError = err;
      var statusCode = getStatusCodeFromErrorCode(apiError.code || 'INTERNAL_ERROR');
      res.status(statusCode).json({
        error: apiError.error,
        code: apiError.code,
        details: apiError.details,
        path: req.path
      });
      return;
    }

    // Default error response
    res.status(500).json({
      error: err.message || "Internal server error",
      code: "INTERNAL_ERROR",
      path: req.path
    });
    return;
  }
  res.status(500).json({
    error: "Unexpected error occurred",
    code: "UNKNOWN_ERROR",
    path: req.path
  });
};
function getStatusCodeFromErrorCode(code) {
  var statusMap = {
    ROUTE_NOT_FOUND: 404,
    AUTH_FAILED: 401,
    FORBIDDEN: 403,
    VALIDATION_ERROR: 400,
    INTERNAL_ERROR: 500,
    UNKNOWN_ERROR: 500
  };
  return statusMap[code] || 500;
}