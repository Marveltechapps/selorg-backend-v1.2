const AuditLog = require('../../common-models/AuditLog');
const User = require('../models/User');
const { asyncHandler } = require('../../core/middleware');

/**
 * Transform raw AuditLog doc to frontend-expected shape
 */
function transformLog(log) {
  if (!log) return null;
  const userIdPop = log.userId;
  const userName = userIdPop?.name || (typeof userIdPop === 'object' && userIdPop?.name) || 'System';
  const userEmail = userIdPop?.email || (typeof userIdPop === 'object' && userIdPop?.email) || 'system@internal';
  const details = log.details || {};
  const description = typeof details === 'string' ? details : (details.message || details.description || JSON.stringify(details));
  const changes = Array.isArray(details.changes) ? details.changes : [];
  const severity = log.severity === 'error' ? 'warning' : (log.severity || 'info');

  return {
    id: log._id?.toString?.(),
    timestamp: log.createdAt?.toISOString?.() || new Date(log.createdAt).toISOString(),
    user: userName,
    userEmail,
    action: log.action || 'view',
    module: log.module || 'config',
    resource: log.entityType || details.entityType || 'N/A',
    resourceId: log.entityId || details.entityId,
    severity: ['info', 'warning', 'critical', 'success'].includes(severity) ? severity : 'info',
    description,
    ipAddress: log.ipAddress || 'N/A',
    userAgent: log.userAgent || '',
    changes: changes.length ? changes.map(c => ({
      field: c.field || c.key || 'field',
      oldValue: c.oldValue ?? c.before ?? '',
      newValue: c.newValue ?? c.after ?? '',
    })) : undefined,
    metadata: typeof details === 'object' && !Array.isArray(details) ? details : undefined,
  };
}

const auditLogsController = {
  listLogs: asyncHandler(async (req, res) => {
    const { module, action, severity, user: userEmailFilter, search, startDate, endDate, page = 1, limit = 50 } = req.query;
    const query = {};

    if (module) query.module = module;
    if (action) query.action = action;
    if (severity) query.severity = severity;

    if (userEmailFilter && userEmailFilter.trim()) {
      const u = await User.findOne({ email: new RegExp(`^${userEmailFilter.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') }).select('_id').lean();
      if (u) query.userId = u._id;
      else return res.json({ success: true, data: [], meta: { total: 0, page: parseInt(page), limit: Math.min(parseInt(limit) || 50, 100), pages: 0 } });
    }

    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }

    if (search && search.trim()) {
      const term = search.trim();
      query.$or = [
        { module: { $regex: term, $options: 'i' } },
        { action: { $regex: term, $options: 'i' } },
        { entityType: { $regex: term, $options: 'i' } },
        { entityId: { $regex: term, $options: 'i' } },
        { 'details.message': { $regex: term, $options: 'i' } },
        { 'details.description': { $regex: term, $options: 'i' } },
      ];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const limitNum = Math.min(parseInt(limit) || 50, 100);
    const logs = await AuditLog.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .lean()
      .populate('userId', 'name email');

    const total = await AuditLog.countDocuments(query);
    const transformed = logs.map(transformLog);

    res.json({
      success: true,
      data: transformed,
      meta: {
        total,
        page: parseInt(page),
        limit: limitNum,
        pages: Math.ceil(total / limitNum) || 1,
      }
    });
  }),

  getLog: asyncHandler(async (req, res) => {
    const log = await AuditLog.findById(req.params.id).lean().populate('userId', 'name email');
    if (!log) {
      return res.status(404).json({ success: false, message: 'Log not found' });
    }
    res.json({ success: true, data: transformLog(log) });
  }),

  getStats: asyncHandler(async (req, res) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [totalEvents, todayEvents, criticalEvents, uniqueUsers, topAction, topModule] = await Promise.all([
      AuditLog.countDocuments(),
      AuditLog.countDocuments({ createdAt: { $gte: today } }),
      AuditLog.countDocuments({ severity: 'critical' }),
      AuditLog.distinct('userId').then(users => users.length),
      AuditLog.aggregate([
        { $group: { _id: '$action', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 1 }
      ]).then(result => result[0]?._id || 'N/A'),
      AuditLog.aggregate([
        { $group: { _id: '$module', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 1 }
      ]).then(result => result[0]?._id || 'N/A'),
    ]);

    res.json({
      success: true,
      data: {
        totalEvents,
        todayEvents,
        criticalEvents,
        uniqueUsers,
        topAction,
        topModule,
      }
    });
  }),
};

module.exports = auditLogsController;
