/**
 * Zod-based request validation middleware
 * Validates request data against Zod schemas
 */

const ErrorResponse = require('../core/utils/ErrorResponse');

/**
 * Middleware factory that validates request data against a Zod schema
 * @param {z.ZodSchema} schema - Zod schema to validate against
 * @returns {Function} Express middleware
 */
const validateRequest = (schema) => {
  return async (req, res, next) => {
    try {
      // Zod schemas typically have structure: { body, query, params }
      // If schema has these keys, validate separately
      if (schema.shape && (schema.shape.body || schema.shape.query || schema.shape.params)) {
        const validationData = {};
        if (schema.shape.body) {
          validationData.body = req.body;
        }
        if (schema.shape.query) {
          validationData.query = req.query;
        }
        if (schema.shape.params) {
          validationData.params = req.params;
        }
        
        const validatedData = await schema.parseAsync(validationData);
        
        if (validatedData.body) {
          req.body = validatedData.body;
        }
        if (validatedData.query) {
          req.query = validatedData.query;
        }
        if (validatedData.params) {
          req.params = validatedData.params;
        }
      } else {
        // Simple schema - validate all request data together
        const dataToValidate = {
          ...req.body,
          ...req.query,
          ...req.params,
        };

        const validatedData = await schema.parseAsync(dataToValidate);

        // Merge validated data back
        Object.assign(req.body, validatedData);
        Object.assign(req.query, validatedData);
        Object.assign(req.params, validatedData);
      }

      next();
    } catch (error) {
      // Handle Zod validation errors
      if (error.errors) {
        return next(
          new ErrorResponse(
            'Validation failed',
            400,
            'VALIDATION_ERROR',
            error.errors.map((err) => ({
              path: err.path ? err.path.join('.') : 'unknown',
              message: err.message,
            }))
          )
        );
      }

      // Handle other errors
      return next(new ErrorResponse('Validation error', 400, 'VALIDATION_ERROR', { error: error.message }));
    }
  };
};

module.exports = { validateRequest };
