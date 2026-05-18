/**
 * Legacy `apiResponse` helper used by merch controllers.
 * Delegates to ResponseFormatter for consistent payload shape.
 */
const ResponseFormatter = require('../core/utils/ResponseFormatter');

const apiResponse = {
  success(data = null, message = 'Success', options = {}) {
    return ResponseFormatter.success(data, message, options);
  },
  error(errorOrMessage, statusCode = 500, options = {}) {
    return ResponseFormatter.error(errorOrMessage, statusCode, options);
  },
};

module.exports = { apiResponse };
