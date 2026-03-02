const AuditLog = require('../../common-models/AuditLog');
const logger = require('../utils/logger');

/**
 * Log auth-related events to AuditLog (and logger for failures).
 * @param {object} opts
 * @param {string} opts.module - e.g. 'auth'
 * @param {string} opts.action - e.g. 'login_success', 'login_failure'
 * @param {string} opts.severity - 'info' | 'warning' | 'error' | 'critical'
 * @param {string|null} opts.userId - User ID (optional for login_failure)
 * @param {object} opts.details - e.g. { email }
 * @param {object} [opts.req] - Express request (for ipAddress, userAgent)
 */
async function logAuthEvent({ module: mod, action, severity, userId, details, req }) {
  const doc = {
    module: mod || 'auth',
    action,
    severity: severity || 'info',
    details: details || {},
  };
  if (userId) doc.userId = userId;
  if (req) {
    doc.ipAddress = req.ip || req.connection?.remoteAddress || req.headers?.['x-forwarded-for']?.split(',')[0]?.trim();
    doc.userAgent = req.get?.('user-agent');
  }
  try {
    await AuditLog.create(doc);
  } catch (err) {
    logger.error('AuditLog create failed', { err: err.message, action });
  }
  if (severity === 'warning' || severity === 'error' || severity === 'critical') {
    logger.warn('Auth event', { action, severity, details: doc.details, ip: doc.ipAddress });
  }
}

module.exports = { logAuthEvent };
