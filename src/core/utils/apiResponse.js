/**
 * Standard API response utilities
 * Ensures all API responses follow consistent format
 */

/**
 * Send standardized success response
 */
const sendSuccess = (res, data, statusCode = 200, requestId) => {
  const response = {
    success: true,
    data,
    meta: {
      requestId: requestId || res.req.id,
      timestamp: new Date().toISOString(),
      version: process.env.API_VERSION || '1.0.0',
    },
  };

  res.status(statusCode).json(response);
};

/**
 * Send standardized error response
 */
const sendError = (res, code, message, statusCode = 500, details, requestId) => {
  const response = {
    success: false,
    error: {
      code,
      message,
      ...(details ? { details } : {}),
    },
    meta: {
      requestId: requestId || res.req.id,
      timestamp: new Date().toISOString(),
      version: process.env.API_VERSION || '1.0.0',
    },
  };

  res.status(statusCode).json(response);
};

/**
 * Send paginated response
 */
const sendPaginated = (res, data, page, limit, total, requestId) => {
  const totalPages = Math.ceil(total / limit);
  
  const response = {
    success: true,
    data,
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    },
    meta: {
      requestId: requestId || res.req.id,
      timestamp: new Date().toISOString(),
      version: process.env.API_VERSION || '1.0.0',
    },
  };

  res.status(200).json(response);
};

// CommonJS export for backward compatibility
module.exports = {
  sendSuccess,
  sendError,
  sendPaginated,
};