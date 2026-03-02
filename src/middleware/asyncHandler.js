/**
 * @desc Async handler to wrap async functions and catch errors
 * @param {Function} fn - The async function to wrap
 * @returns {Function} - The wrapped function for Express middleware
 */
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

module.exports = asyncHandler;

