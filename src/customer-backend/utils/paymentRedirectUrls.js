/**
 * Resolve customer-web and Worldline return URLs safely.
 * Production / hosted API deployments must never redirect customers to
 * localhost / private IPs even if NODE_ENV is mis-set to development or a
 * .env still contains local developer values.
 */

const PRODUCTION_WEB_APP_URL = 'https://www.selorg.com';
const PRODUCTION_API_RETURN_URL =
  'https://api.selorg.com/api/v1/customer/payments/worldline/return';

const LOCAL_HOST_RE =
  /^(localhost|127\.0\.0\.1|0\.0\.0\.0|::1)$/i;
const PRIVATE_IP_RE =
  /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/;

function trimEnv(value) {
  const s = String(value ?? '').trim();
  return s || null;
}

function isLocalOrPrivateHost(urlOrHost) {
  if (!urlOrHost) return false;
  try {
    const host = String(urlOrHost).includes('://')
      ? new URL(String(urlOrHost)).hostname
      : String(urlOrHost).split('/')[0].split(':')[0];
    if (LOCAL_HOST_RE.test(host)) return true;
    if (PRIVATE_IP_RE.test(host)) return true;
    return false;
  } catch {
    return false;
  }
}

/**
 * True when this process is clearly serving a hosted API (e.g. api.selorg.com),
 * even if NODE_ENV was left as "development" on the EC2 env file.
 */
function isHostedWorldlineDeployment() {
  const hostedSignals = [
    process.env.WORLDLINE_RETURN_URL,
    process.env.API_BASE_URL,
    process.env.DIDIT_WEBHOOK_BASE_URL,
    process.env.PUBLIC_API_URL,
  ];
  for (const signal of hostedSignals) {
    const trimmed = trimEnv(signal);
    if (trimmed && !isLocalOrPrivateHost(trimmed)) {
      return true;
    }
  }
  return false;
}

/**
 * Local Paynimo redirects are only for a fully local stack.
 * NODE_ENV!=production alone is NOT enough — AWS often runs with
 * NODE_ENV=development while WORLDLINE_RETURN_URL points at api.selorg.com.
 */
function allowsLocalRedirectUrls() {
  if (String(process.env.NODE_ENV || '').trim().toLowerCase() === 'production') {
    return false;
  }
  if (isHostedWorldlineDeployment()) {
    return false;
  }
  return true;
}

/**
 * Customer web app origin used for gateway cancel/success/fail redirects.
 */
function resolveWebAppBaseUrl(logger) {
  const allowLocal = allowsLocalRedirectUrls();
  const candidates = [
    process.env.WORLDLINE_WEB_APP_URL,
    process.env.CUSTOMER_WEB_URL,
    process.env.FRONTEND_URL,
  ];

  for (const candidate of candidates) {
    const trimmed = trimEnv(candidate);
    if (!trimmed) continue;
    const base = trimmed.replace(/\/$/, '');
    if (!allowLocal && isLocalOrPrivateHost(base)) {
      if (logger && typeof logger.warn === 'function') {
        logger.warn('Ignoring local customer web URL in hosted/production deployment', {
          candidate: base,
          fallback: PRODUCTION_WEB_APP_URL,
          nodeEnv: process.env.NODE_ENV || null,
        });
      }
      continue;
    }
    return base;
  }

  if (allowLocal) return 'http://localhost:5173';
  return PRODUCTION_WEB_APP_URL;
}

/**
 * Merchant return URL registered with Worldline for non-web / API callbacks.
 * Web checkout uses the static /paynimo-return.html bridge on the web app instead.
 */
function resolveWorldlineApiReturnUrl(logger) {
  const allowLocal = allowsLocalRedirectUrls();
  const fromEnv = trimEnv(process.env.WORLDLINE_RETURN_URL);

  if (fromEnv) {
    const cleaned = fromEnv.replace(/\/$/, '');
    if (allowLocal || !isLocalOrPrivateHost(cleaned)) {
      return cleaned;
    }
    if (logger && typeof logger.warn === 'function') {
      logger.warn('Ignoring local WORLDLINE_RETURN_URL in hosted/production deployment', {
        candidate: cleaned,
      });
    }
  }

  if (allowLocal) {
    return fromEnv ? fromEnv.replace(/\/$/, '') : null;
  }

  const apiBase = trimEnv(process.env.API_BASE_URL);
  if (apiBase && !isLocalOrPrivateHost(apiBase)) {
    return `${apiBase.replace(/\/$/, '')}/api/v1/customer/payments/worldline/return`;
  }

  return PRODUCTION_API_RETURN_URL;
}

/**
 * Platform-specific return URL embedded in the Paynimo session payload.
 */
function resolveReturnUrlForPlatform(platform, logger) {
  const normalized = String(platform || '')
    .trim()
    .toLowerCase();
  if (normalized === 'web') {
    return `${resolveWebAppBaseUrl(logger)}/paynimo-return.html`;
  }
  return resolveWorldlineApiReturnUrl(logger);
}

module.exports = {
  PRODUCTION_WEB_APP_URL,
  PRODUCTION_API_RETURN_URL,
  isLocalOrPrivateHost,
  isHostedWorldlineDeployment,
  allowsLocalRedirectUrls,
  resolveWebAppBaseUrl,
  resolveWorldlineApiReturnUrl,
  resolveReturnUrlForPlatform,
};
