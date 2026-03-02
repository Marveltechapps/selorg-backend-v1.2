const { ErrorResponse } = require('../utils/ErrorResponse');
const { logger } = require('../utils/logger');

function errorHandler(err, req, res, next) {
  let error = { ...err, message: err.message };
  logger.error(err);

  if (err.name === 'CastError') {
    error = new ErrorResponse('Resource not found', 404);
  }
  if (err.code === 11000) {
    error = new ErrorResponse('Duplicate field value entered', 400);
  }
  if (err.name === 'ValidationError') {
    const message = Object.values(err.errors)
      .map((val) => val.message)
      .join(', ');
    error = new ErrorResponse(message, 400);
  }

  const statusCode = error.statusCode || 500;
  const message = error.message || 'Server Error';
  res.status(statusCode).json({
    success: false,
    error: message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
}

module.exports = { errorHandler };
