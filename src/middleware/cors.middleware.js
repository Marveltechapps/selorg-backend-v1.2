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

function applyCors(app) {
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
