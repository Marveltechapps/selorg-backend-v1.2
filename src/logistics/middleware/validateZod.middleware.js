'use strict';

const { ValidationError } = require('../utils/errors');

function validateBody(schema) {
  return (req, res, next) => {
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return next(new ValidationError('Invalid request body', parsed.error.flatten()));
    }
    req.validatedBody = parsed.data;
    return next();
  };
}

function validateQuery(schema) {
  return (req, res, next) => {
    const parsed = schema.safeParse(req.query);
    if (!parsed.success) {
      return next(new ValidationError('Invalid query', parsed.error.flatten()));
    }
    req.validatedQuery = parsed.data;
    return next();
  };
}

function validateParams(schema) {
  return (req, res, next) => {
    const parsed = schema.safeParse(req.params);
    if (!parsed.success) {
      return next(new ValidationError('Invalid path params', parsed.error.flatten()));
    }
    req.validatedParams = parsed.data;
    return next();
  };
}

module.exports = { validateBody, validateQuery, validateParams };
