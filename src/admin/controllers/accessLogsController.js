/**
 * Access Logs Controller
 * Serves user/role management and auth events from AuditLog.
 * Endpoint: GET /admin/access-logs
 */
const AuditLog = require('../../common-models/AuditLog');
const asyncHandler = require('../../middleware/asyncHandler');

// Map backend action to frontend ActionType
const ACTION_MAP = {
  login_success: 'login',
  login_failure: 'failed_login',
  user_create: 'update_user',
  user_update: 'update_user',
  user_delete: 'update_user',
  role_assign: 'assign_role',
  permissions_update: 'update_permissions',
  user_suspend: 'suspend_user',
};

const getAccessLogs = asyncHandler(async (req, res) => {
  const { userId, action, status, startDate, endDate, page = 1, limit = 50 } = req.query;

  const conditions = [{ module: { $in: ['auth', 'admin'] } }];
  if (userId) conditions.push({ userId });
  if (action) {
    const backendActions = Object.entries(ACTION_MAP)
      .filter(([, front]) => front === action)
      .map(([back]) => back);
    if (backendActions.length > 0) conditions.push({ action: { $in: backendActions } });
  }
  if (status === 'failed') {
    conditions.push({
      $or: [
        { action: 'login_failure' },
        { severity: { $in: ['error', 'critical'] } },
      ],
    });
  } else if (status === 'success') {
    conditions.push({ action: { $ne: 'login_failure' } });
    conditions.push({ severity: { $nin: ['error', 'critical'] } });
  }
  if (startDate || endDate) {
    const createdAt = {};
    if (startDate) createdAt.$gte = new Date(startDate);
    if (endDate) createdAt.$lte = new Date(endDate);
    conditions.push({ createdAt });
  }

  const query = conditions.length > 1 ? { $and: conditions } : conditions[0];

  const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);
  const logs = await AuditLog.find(query)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(parseInt(limit, 10))
    .populate('userId', 'name email')
    .lean();

  const total = await AuditLog.countDocuments(query);

  const data = logs.map((log) => {
    const user = log.userId;
    const frontendAction = ACTION_MAP[log.action] || log.action;
    const logStatus = log.action === 'login_failure' || ['error', 'critical'].includes(log.severity) ? 'failed' : 'success';
    const details = typeof log.details === 'object' ? JSON.stringify(log.details) : (log.details || '');
    return {
      id: log._id.toString(),
      timestamp: log.createdAt?.toISOString() || new Date().toISOString(),
      userId: log.userId ? (user?._id?.toString() || log.userId.toString()) : 'unknown',
      userName: user?.name || 'Unknown',
      userEmail: user?.email || log.details?.email || '—',
      action: frontendAction,
      details,
      status: logStatus,
      ipAddress: log.ipAddress,
      browser: log.userAgent,
    };
  });

  res.json({
    success: true,
    data,
    meta: {
      total,
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
      pages: Math.ceil(total / parseInt(limit, 10)),
      requestId: req.id,
      timestamp: new Date().toISOString(),
    },
  });
});

module.exports = { getAccessLogs };
