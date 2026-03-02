/**
 * Sessions Controller (Option B - AuditLog-based)
 * Returns recent login events as "sessions" (read-only).
 * Revoke is not implemented (stateless JWT).
 */
const AuditLog = require('../../common-models/AuditLog');
const asyncHandler = require('../../middleware/asyncHandler');

const getSessions = asyncHandler(async (req, res) => {
  const { userId } = req.query;
  const limit = Math.min(parseInt(req.query.limit, 10) || 50, 100);

  const query = {
    module: 'auth',
    action: 'login_success',
  };
  if (userId) query.userId = userId;

  const logs = await AuditLog.find(query)
    .sort({ createdAt: -1 })
    .limit(limit)
    .populate('userId', 'name email')
    .lean();

  const data = logs.map((log, idx) => {
    const user = log.userId;
    const ua = log.userAgent || '';
    let deviceType = 'desktop';
    if (/mobile|android|iphone|ipad/i.test(ua)) deviceType = 'mobile';
    else if (/laptop|macintosh|windows/i.test(ua)) deviceType = 'laptop';
    return {
      id: log._id.toString(),
      userId: user?._id?.toString() || log.userId?.toString() || '',
      userName: user?.name || 'Unknown',
      userEmail: user?.email || log.details?.email || '—',
      device: ua || 'Unknown',
      deviceType,
      ipAddress: log.ipAddress || '—',
      location: '—',
      lastActivity: log.createdAt?.toISOString() || new Date().toISOString(),
      status: 'inactive',
    };
  });

  res.json({
    success: true,
    data,
    meta: {
      requestId: req.id,
      timestamp: new Date().toISOString(),
    },
  });
});

const revokeSession = asyncHandler(async (req, res) => {
  res.status(501).json({
    success: false,
    error: {
      code: 'NOT_IMPLEMENTED',
      message: 'Session revocation requires token blacklist. Not implemented for stateless JWT.',
    },
    meta: {
      requestId: req.id,
      timestamp: new Date().toISOString(),
    },
  });
});

module.exports = { getSessions, revokeSession };
