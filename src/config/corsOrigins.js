const logger = require('../core/utils/logger');

const DEFAULT_ALLOWED_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:5000',
  'http://localhost:5001',
  'http://localhost:5002',
  'http://localhost:5173',
  'http://localhost:8081',
  'http://localhost:19006',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:5000',
  'http://127.0.0.1:5001',
  'http://127.0.0.1:5002',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:8081',
  'http://127.0.0.1:19006',
  'https://dashboard.selorg.com',
  'https://www.dashboard.selorg.com',
];

function parseOrigins(value) {
  if (!value) return [];
  return value
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function getAllowedOrigins() {
  return Array.from(
    new Set([
      ...DEFAULT_ALLOWED_ORIGINS,
      ...parseOrigins(process.env.ALLOWED_ORIGINS),
      ...parseOrigins(process.env.CORS_ORIGIN),
    ])
  );
}

function isLocalOrigin(origin) {
  return (
    typeof origin === 'string' &&
    /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)(:\d+)?\/?$/i.test(origin.trim())
  );
}

function isLanOrigin(origin) {
  return (
    typeof origin === 'string' &&
    /^https?:\/\/(192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)(:\d+)?\/?$/i.test(
      origin.trim()
    )
  );
}

function isExpoOrMobileOrigin(origin) {
  return typeof origin === 'string' && (origin.trim().startsWith('exp://') || origin.trim().startsWith('http://localhost'));
}

/** Production dashboard/API hosts on selorg.com (https only). */
function isSelorgHttpsOrigin(origin) {
  if (typeof origin !== 'string') return false;
  const o = origin.trim();
  // Allow optional port (e.g. :443) and optional trailing slash
  return /^https:\/\/([a-z0-9-]+\.)*selorg\.com(:\d+)?\/?$/i.test(o);
}

function isAllowedOrigin(origin) {
  // Allow requests with no origin (like mobile apps or curl)
  if (!origin || origin === 'null' || origin === '') return true;
  
  const normalized = origin.trim().toLowerCase();
  
  // 1. Check local/LAN origins
  if (isLocalOrigin(normalized) || isLanOrigin(normalized) || isExpoOrMobileOrigin(normalized)) {
    return true;
  }
  
  // 2. Check production selorg.com domains (including subdomains and optional ports)
  if (isSelorgHttpsOrigin(normalized)) {
    return true;
  }
  
  // 3. In non-production, be more permissive
  if (process.env.NODE_ENV !== 'production') {
    return true;
  }
  
  // 4. Check against explicitly allowed origins from env or defaults
  const allowed = getAllowedOrigins().map(o => o.trim().toLowerCase());
  return allowed.includes(normalized);
}

function createCorsOriginHandler(onBlocked) {
  return (origin, callback) => {
    if (isAllowedOrigin(origin)) {
      // Reflect exact origin (required when credentials: true)
      callback(null, origin || true);
      return;
    }

    if (typeof onBlocked === 'function') {
      onBlocked(origin, getAllowedOrigins());
    }

    logger.warn('CORS origin rejected', {
      origin,
      nodeEnv: process.env.NODE_ENV || 'development',
    });
    callback(null, false);
  };
}

module.exports = {
  DEFAULT_ALLOWED_ORIGINS,
  getAllowedOrigins,
  isAllowedOrigin,
  isSelorgHttpsOrigin,
  createCorsOriginHandler,
};
