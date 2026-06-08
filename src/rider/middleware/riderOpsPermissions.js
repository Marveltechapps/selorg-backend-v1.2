const { userHasPermission } = require('../../config/permissions');

/** Frontend rider-ops permission keys → acceptable JWT permission patterns */
const PERM_ALIASES = {
  'dispatch.assign': ['dispatch.assign', 'delivery.assign', 'rider_ops.dispatch.assign', 'delivery.*', 'rider_ops.*'],
  'dispatch.auto_assign': ['dispatch.auto_assign', 'delivery.assign', 'rider_ops.dispatch.auto_assign', 'delivery.*', 'rider_ops.*'],
  'shift.manage': ['shift.manage', 'rider_ops.shift.manage', 'rider_ops.*'],
  'hr.approve': ['hr.approve', 'rider_ops.hr.approve', 'rider_ops.*'],
  'audit.view': ['audit.view', 'compliance.audit.read', 'rider_ops.audit.view', 'rider_ops.*'],
  'analytics.export': ['analytics.export', 'analytics.reports.read', 'rider_ops.analytics.export', 'rider_ops.*'],
  'cash.view': ['cash.view', 'payments.read', 'rider_ops.cash.view', 'rider_ops.*'],
};

function hasRiderOpsPermission(user, permission) {
  if (!user) return false;
  const role = String(user.role || '').toLowerCase();
  if (role === 'super_admin' || role === 'superadmin' || role === 'admin') return true;

  const perms = user.permissions || [];
  const candidates = PERM_ALIASES[permission] || [permission];
  return candidates.some((c) => userHasPermission(perms, c));
}

function requireRiderOpsPermission(permission) {
  return (req, res, next) => {
    if (hasRiderOpsPermission(req.user, permission)) return next();
    res.status(403).json({
      success: false,
      error: {
        code: 'PERMISSION_DENIED',
        message: `Permission denied: ${permission}`,
      },
    });
  };
}

module.exports = { hasRiderOpsPermission, requireRiderOpsPermission, PERM_ALIASES };
