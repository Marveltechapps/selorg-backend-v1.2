'use strict';

const cors = require('cors');
const logger = require('../core/utils/logger');
const { createCorsOriginHandler, isAllowedOrigin } = require('../config/corsOrigins');

const CORS_OPTIONS = {
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Request-ID',
    'X-Store-Id',
    'X-Site-Id',
    'Idempotency-Key',
    'Accept',
    'Origin',
  ],
  exposedHeaders: ['X-Request-ID', 'Retry-After', 'RateLimit-Reset', 'RateLimit-Remaining'],
  optionsSuccessStatus: 204,
  maxAge: 86400,
  preflightContinue: false,
};

const strictCors = cors({
  ...CORS_OPTIONS,
  origin: createCorsOriginHandler((origin, allowedOrigins) => {
    logger.warn('CORS blocked dashboard/API origin', { origin, allowedOrigins });
  }),
});

const customerCors = cors({
  ...CORS_OPTIONS,
  origin: true,
});

function isCustomerApiPath(req) {
  const path = req.path || '';
  return path.startsWith('/api/v1/customer') || path.startsWith('/api/payment');
}

function setPreflightHeaders(req, res) {
  const origin = req.headers.origin;
  if (!origin || !isAllowedOrigin(origin)) return false;
  res.header('Access-Control-Allow-Origin', origin);
  res.header('Access-Control-Allow-Credentials', 'true');
  res.header('Access-Control-Allow-Methods', CORS_OPTIONS.methods.join(', '));
  res.header('Access-Control-Allow-Headers', CORS_OPTIONS.allowedHeaders.join(', '));
  res.header('Access-Control-Max-Age', String(CORS_OPTIONS.maxAge));
  res.header('Vary', 'Origin');
  return true;
}

function applyCors(app) {
  // 0. Answer OPTIONS preflight before other middleware (dashboard login from dashboard.selorg.com)
  app.use((req, res, next) => {
    if (req.method !== 'OPTIONS') return next();
    if (!setPreflightHeaders(req, res)) return next();
    return res.sendStatus(CORS_OPTIONS.optionsSuccessStatus);
  });

  // 1. Manual header fallback (runs for all requests including those that might skip or fail in the cors middleware)
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin && isAllowedOrigin(origin)) {
      // Set these immediately; the cors() middleware below will also try to set them.
      // res.setHeader is smart enough to not duplicate if we check or if it's the same value.
      res.header('Access-Control-Allow-Origin', origin);
      res.header('Access-Control-Allow-Credentials', 'true');
      res.header('Vary', 'Origin');
    }
    next();
  });

  // 2. Standard CORS middleware for Express routes
  app.use((req, res, next) => {
    if (isCustomerApiPath(req)) {
      return customerCors(req, res, next);
    }
    return strictCors(req, res, next);
  });
}

/** Ensure error responses still include CORS headers for allowed browser origins. */
function applyCorsHeadersIfAllowed(req, res) {
  const origin = req.headers.origin;
  if (!origin || !isAllowedOrigin(origin)) return;
  if (res.getHeader('Access-Control-Allow-Origin')) return;
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Vary', 'Origin');
}

module.exports = {
  applyCors,
  applyCorsHeadersIfAllowed,
  isCustomerApiPath,
};
