/**
 * In-memory login lockout: after N failed attempts for an email, block further
 * attempts for a period. For multi-instance deployments, use Redis (e.g.
 * key login_attempts:${normalizedEmail}, increment + TTL).
 */
const logger = require('../utils/logger');

const MAX_ATTEMPTS = parseInt(process.env.LOGIN_LOCKOUT_MAX_ATTEMPTS || '5', 10);
const LOCKOUT_DURATION_SEC = parseInt(process.env.LOGIN_LOCKOUT_DURATION_SEC || '900', 10); // 15 min default

// email (normalized) -> { attempts, lockedUntil: unix sec }
const store = new Map();

const CLEAN_INTERVAL_MS = 5 * 60 * 1000;
let cleanInterval;

function startCleanInterval() {
  if (cleanInterval) return;
  cleanInterval = setInterval(() => {
    const now = Math.floor(Date.now() / 1000);
    let removed = 0;
    for (const [key, data] of store.entries()) {
      if (data.lockedUntil && data.lockedUntil <= now) {
        store.delete(key);
        removed++;
      }
    }
    if (removed > 0) logger.debug('Login lockout cleanup', { removed });
  }, CLEAN_INTERVAL_MS);
}

function normalizeEmail(email) {
  if (typeof email !== 'string') return '';
  return email.toLowerCase().trim();
}

/**
 * Check if this email is currently locked out.
 * @param {string} email
 * @returns {{ locked: boolean, retryAfterSeconds?: number }}
 */
function isLocked(email) {
  const key = normalizeEmail(email);
  if (!key) return { locked: false };
  const data = store.get(key);
  if (!data) return { locked: false };
  const now = Math.floor(Date.now() / 1000);
  if (data.lockedUntil && data.lockedUntil > now) {
    return { locked: true, retryAfterSeconds: data.lockedUntil - now };
  }
  if (data.lockedUntil && data.lockedUntil <= now) {
    store.delete(key);
  }
  return { locked: false };
}

/**
 * Record a failed login attempt. Call on authentication failure.
 * @param {string} email
 */
function recordFailure(email) {
  const key = normalizeEmail(email);
  if (!key) return;
  const data = store.get(key) || { attempts: 0 };
  data.attempts += 1;
  const now = Math.floor(Date.now() / 1000);
  if (data.attempts >= MAX_ATTEMPTS) {
    data.lockedUntil = now + LOCKOUT_DURATION_SEC;
    logger.warn('Login lockout activated', {
      email: key.substring(0, 3) + '***',
      attempts: data.attempts,
      lockedUntil: new Date(data.lockedUntil * 1000).toISOString(),
    });
  }
  store.set(key, data);
  startCleanInterval();
}

/**
 * Clear attempts for this email. Call on successful login.
 * @param {string} email
 */
function clearAttempts(email) {
  const key = normalizeEmail(email);
  if (!key) return;
  store.delete(key);
}

module.exports = {
  isLocked,
  recordFailure,
  clearAttempts,
};
