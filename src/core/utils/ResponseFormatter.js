/**
 * ResponseFormatter Utility — Phase A API Standardization
 * 
 * Ensures all API responses follow a consistent format:
 * {
 *   success: boolean,
 *   message: string,
 *   data: any,
 *   error: { code, message, details } | null,
 *   pagination: { total, page, limit, pages } | null,
 *   timestamp: ISO string
 * }
 * 
 * Usage:
 *   // Success response
 *   res.json(ResponseFormatter.success(data, 'Items fetched'))
 *   
 *   // Paginated response
 *   res.json(ResponseFormatter.paginated(items, total, page, limit))
 *   
 *   // Error response
 *   res.status(400).json(ResponseFormatter.error(err, 400))
 *   
 *   // Validation error
 *   res.status(422).json(ResponseFormatter.validationError([{ field: 'email', message: 'Invalid' }]))
 */

class ResponseFormatter {
  /**
   * Success response with optional data
   */
  static success(data = null, message = 'Success', options = {}) {
    return {
      success: true,
      message,
      data,
      error: null,
      pagination: null,
      timestamp: new Date().toISOString(),
      ...options,
    };
  }

  /**
   * Paginated response with metadata
   */
  static paginated(items = [], total = 0, page = 1, limit = 20, options = {}) {
    const pages = Math.ceil(total / limit);
    return {
      success: true,
      message: 'Items fetched successfully',
      data: items,
      error: null,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages,
        hasNextPage: page < pages,
        hasPrevPage: page > 1,
      },
      timestamp: new Date().toISOString(),
      ...options,
    };
  }

  /**
   * Error response with error details
   */
  static error(errorOrMessage, statusCode = 500, options = {}) {
    let error = {
      code: statusCode,
      message: 'Internal server error',
      details: null,
    };

    if (typeof errorOrMessage === 'string') {
      error.message = errorOrMessage;
    } else if (errorOrMessage instanceof Error) {
      error.message = errorOrMessage.message;
      error.details = process.env.NODE_ENV === 'development' ? errorOrMessage.stack : null;
    } else if (typeof errorOrMessage === 'object') {
      error = { ...error, ...errorOrMessage };
    }

    return {
      success: false,
      message: error.message,
      data: null,
      error,
      pagination: null,
      timestamp: new Date().toISOString(),
      ...options,
    };
  }

  /**
   * Validation error response
   */
  static validationError(validationErrors = [], message = 'Validation failed', options = {}) {
    return {
      success: false,
      message,
      data: null,
      error: {
        code: 422,
        message: 'Validation Error',
        details: validationErrors, // Array of { field, message }
      },
      pagination: null,
      timestamp: new Date().toISOString(),
      ...options,
    };
  }

  /**
   * Resource not found error
   */
  static notFound(resourceType = 'Resource', id = null, options = {}) {
    const message = id ? `${resourceType} #${id} not found` : `${resourceType} not found`;
    return this.error(message, 404, options);
  }

  /**
   * Unauthorized (missing or invalid auth)
   */
  static unauthorized(message = 'Authentication required', options = {}) {
    return this.error(message, 401, options);
  }

  /**
   * Forbidden (auth OK but no permission)
   */
  static forbidden(message = 'Access denied', options = {}) {
    return this.error(message, 403, options);
  }

  /**
   * Conflict error (duplicate, state conflict, etc.)
   */
  static conflict(message = 'Resource conflict', options = {}) {
    return this.error(message, 409, options);
  }

  /**
   * Rate limit error
   */
  static rateLimited(retryAfter = 60, options = {}) {
    const response = this.error('Rate limit exceeded', 429, options);
    response.error.retryAfter = retryAfter;
    return response;
  }

  /**
   * Create middleware to attach formatter to response object
   */
  static middleware() {
    return (req, res, next) => {
      res.formatSuccess = (data, message, options) => {
        res.json(ResponseFormatter.success(data, message, options));
      };

      res.formatPaginated = (items, total, page, limit, options) => {
        res.json(ResponseFormatter.paginated(items, total, page, limit, options));
      };

      res.formatError = (error, statusCode, options) => {
        res.status(statusCode || 500).json(ResponseFormatter.error(error, statusCode, options));
      };

      res.formatValidationError = (errors, message, options) => {
        res.status(422).json(ResponseFormatter.validationError(errors, message, options));
      };

      res.formatNotFound = (type, id, options) => {
        res.status(404).json(ResponseFormatter.notFound(type, id, options));
      };

      res.formatUnauthorized = (message, options) => {
        res.status(401).json(ResponseFormatter.unauthorized(message, options));
      };

      res.formatForbidden = (message, options) => {
        res.status(403).json(ResponseFormatter.forbidden(message, options));
      };

      next();
    };
  }
}

module.exports = ResponseFormatter;
