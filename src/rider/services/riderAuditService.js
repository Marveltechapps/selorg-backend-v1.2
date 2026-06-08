const AuditLog = require('../../common-models/AuditLog');
const logger = require('../../core/utils/logger');

async function logRiderOpsAction(req, action, entityType, entityId, details = {}) {
  try {
    const user = req.user || {};
    await AuditLog.create({
      module: 'rider_ops',
      action,
      entityType,
      entityId: entityId ? String(entityId) : undefined,
      userId: user._id || user.id || undefined,
      severity: details.severity || 'info',
      details: {
        ...details,
        actorEmail: user.email,
        actorRole: user.role,
        actorName: user.name,
      },
      ipAddress: req.ip || req.headers?.['x-forwarded-for'] || undefined,
      userAgent: req.headers?.['user-agent'],
    });
  } catch (err) {
    logger.warn('Rider audit log failed', { action, error: err.message });
  }
}

async function listRiderOpsAudit({ page = 1, limit = 50, action, entityType } = {}) {
  const query = { module: 'rider_ops' };
  if (action) query.action = action;
  if (entityType) query.entityType = entityType;

  const skip = (Math.max(1, page) - 1) * limit;
  const [items, total] = await Promise.all([
    AuditLog.find(query).sort({ createdAt: -1 }).skip(skip).limit(Math.min(limit, 100)).lean(),
    AuditLog.countDocuments(query),
  ]);

  return {
    items: items.map((row) => ({
      id: String(row._id),
      action: row.action,
      entityType: row.entityType,
      entityId: row.entityId,
      severity: row.severity,
      details: row.details,
      createdAt: row.createdAt,
    })),
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit) || 1,
  };
}

module.exports = { logRiderOpsAction, listRiderOpsAudit };
