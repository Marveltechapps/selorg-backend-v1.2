const { randomUUID } = require('crypto');

/**
 * Request ID middleware
 * Generates a unique UUID for each request and attaches it to:
 * - req.id (for use in controllers/services)
 * - X-Request-ID response header (for client correlation)
 * 
 * This enables request tracing across the entire application stack
 */
const requestIdMiddleware = (req, res, next) => {
  // Use existing request ID from header if present (for distributed tracing)
  // Otherwise generate a new one
  const requestId = req.headers['x-request-id'] || randomUUID();
  
  // Attach to request object
  req.id = requestId;
  
  // Add to response header for client correlation
  res.setHeader('X-Request-ID', requestId);
  
  next();
};

// CommonJS export for backward compatibility
module.exports = { requestIdMiddleware };