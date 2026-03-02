const logger = require('../utils/logger');

const REQUEST_LOG = process.env.REQUEST_LOG || 'full';
const MINIMAL = REQUEST_LOG === 'minimal';

// Paths to skip in minimal mode (health checks, etc.)
const SKIP_PATHS = new Set(['/health', '/health/ready', '/health/db']);

/**
 * Request logging middleware
 * Logs all incoming requests with duration tracking.
 * Set REQUEST_LOG=minimal for one line per request and no health-check logs.
 */
const requestLoggerMiddleware = (req, res, next) => {
  const startTime = Date.now();

  if (!MINIMAL) {
    logger.info('Incoming request', {
      requestId: req.id,
      method: req.method,
      path: req.path,
      query: req.query,
      userId: req.user?.userId,
    });
  }

  const originalEnd = res.end.bind(res);
  res.end = function (chunk, encoding, cb) {
    const duration = Date.now() - startTime;

    if (MINIMAL) {
      if (!SKIP_PATHS.has(req.path)) {
        logger.info(`${req.method} ${req.path} ${res.statusCode} ${duration}ms`);
      }
    } else {
      logger.logRequest(req, res, duration);
    }

    if (process.env.ENABLE_METRICS === 'true') {
      try {
        const metrics = require('../../utils/metrics');
        metrics.recordHttpRequest(req.method, req.path, res.statusCode, duration);
      } catch (err) {
        // Ignore metrics errors
      }
    }

    if (typeof chunk === 'function') {
      return originalEnd(chunk);
    } else if (typeof encoding === 'function') {
      return originalEnd(chunk, encoding);
    } else {
      return originalEnd(chunk, encoding, cb);
    }
  };

  next();
};

module.exports = { requestLoggerMiddleware };
