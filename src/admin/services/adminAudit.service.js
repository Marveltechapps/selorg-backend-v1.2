/**
 * Admin Audit Service
 * Logs admin actions to AuditLog for compliance and audit trail.
 */
const AuditLog = require('../../common-models/AuditLog');
const logger = require('../../core/utils/logger');

/**
 * Log an admin action to AuditLog
 * @param {object} opts
 * @param {string} opts.module - e.g. 'admin'
 * @param {string} opts.action - e.g. 'picker_approved', 'picker_rejected', 'order_cancelled'
 * @param {string} opts.entityType - e.g. 'picker', 'order', 'device'
 * @param {string} opts.entityId - ID of the entity
 * @param {string} opts.userId - Admin user ID (ObjectId or string)
 * @param {object} opts.details - Additional details
 * @param {object} [opts.req] - Express request (for ipAddress, userAgent)
 */
async function logAdminAction({ module: mod = 'admin', action, entityType, entityId, userId, details = {}, req }) {
  const doc = {
    module: mod,
    action,
    entityType: entityType || undefined,
    entityId: entityId || undefined,
    severity: 'info',
    details,
  };
  if (userId) {
    doc.userId = userId;
  }
  if (req) {
    doc.ipAddress = req.ip || req.connection?.remoteAddress || req.headers?.['x-forwarded-for']?.split(',')[0]?.trim();
    doc.userAgent = req.get?.('user-agent');
  }
  try {
    await AuditLog.create(doc);
  } catch (err) {
    logger.error('Admin audit log create failed', { err: err.message, action });
  }
}

module.exports = { logAdminAction };
