const { ErrorResponse } = require('../utils/ErrorResponse');

function notFound(req, res, next) {
  next(new ErrorResponse(`Not found - ${req.originalUrl}`, 404));
}

module.exports = { notFound };
