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
    /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)(:\d+)?$/i.test(origin.trim())
  );
}

function isLanOrigin(origin) {
  return (
    typeof origin === 'string' &&
    /^https?:\/\/(192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)(:\d+)?$/i.test(
      origin.trim()
    )
  );
}

function isExpoOrMobileOrigin(origin) {
  return typeof origin === 'string' && origin.trim().startsWith('exp://');
}

function isAllowedOrigin(origin) {
  if (!origin || origin === 'null' || origin === '') return true;
  if (isLocalOrigin(origin) || isLanOrigin(origin) || isExpoOrMobileOrigin(origin)) return true;
  if (process.env.NODE_ENV !== 'production') return true;
  return getAllowedOrigins().includes(origin);
}

function createCorsOriginHandler(onBlocked) {
  return (origin, callback) => {
    if (isAllowedOrigin(origin)) {
      callback(null, true);
      return;
    }

    if (typeof onBlocked === 'function') {
      onBlocked(origin, getAllowedOrigins());
    }

    callback(new Error('Not allowed by CORS'));
  };
}

module.exports = {
  DEFAULT_ALLOWED_ORIGINS,
  getAllowedOrigins,
  isAllowedOrigin,
  createCorsOriginHandler,
};
