/**
 * In-memory token blocklist for logout/revocation.
 * Tokens added here are rejected by auth middleware until they would have expired.
 * For multi-instance deployments, replace with Redis-backed blocklist.
 */
const logger = require('../utils/logger');

const blocklist = new Map(); // token -> exp (unix timestamp in seconds)

// Clean expired entries every 5 minutes
const CLEAN_INTERVAL_MS = 5 * 60 * 1000;
let cleanInterval;

function startCleanInterval() {
  if (cleanInterval) return;
  cleanInterval = setInterval(() => {
    const now = Math.floor(Date.now() / 1000);
    let removed = 0;
    for (const [token, exp] of blocklist.entries()) {
      if (exp <= now) {
        blocklist.delete(token);
        removed++;
      }
    }
    if (removed > 0) logger.debug('Token blocklist cleanup', { removed });
  }, CLEAN_INTERVAL_MS);
}

/**
 * Add a token to the blocklist until its expiry.
 * @param {string} token - Raw JWT string
 * @param {number} exp - Unix expiry time in seconds (from decoded JWT)
 */
function add(token, exp) {
  if (!token || !exp) return;
  blocklist.set(token, exp);
  startCleanInterval();
}

/**
 * Check if a token is revoked.
 * @param {string} token - Raw JWT string
 * @returns {boolean}
 */
function has(token) {
  if (!token) return false;
  const exp = blocklist.get(token);
  if (!exp) return false;
  if (exp <= Math.floor(Date.now() / 1000)) {
    blocklist.delete(token);
    return false;
  }
  return true;
}

module.exports = {
  add,
  has,
};
