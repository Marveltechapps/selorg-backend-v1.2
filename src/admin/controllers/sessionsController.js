/**
 * Sessions Controller (AuditLog-based).
 * Revoke marks the session as revoked in audit stream even for stateless JWT.
 */
const AuditLog = require('../../common-models/AuditLog');
const asyncHandler = require('../../middleware/asyncHandler');

const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '1h';

/** Parse JWT-style expiry (e.g. 1h, 30m, 7d) to milliseconds. */
function parseExpiryToMs(expiry) {
  const match = String(expiry || '1h')
    .trim()
    .match(/^(\d+)([smhd])$/i);
  if (!match) return 60 * 60 * 1000;
  const n = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();
  const multipliers = { s: 1000, m: 60 * 1000, h: 60 * 60 * 1000, d: 24 * 60 * 60 * 1000 };
  return n * (multipliers[unit] || 60 * 60 * 1000);
}

const SESSION_TTL_MS = parseExpiryToMs(JWT_EXPIRES_IN);

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

  const sessionIds = logs.map((log) => log._id.toString());
  const revokedIds = new Set();

  if (sessionIds.length > 0) {
    const revokedLogs = await AuditLog.find({
      module: 'auth',
      action: 'session_revoked',
      $or: [
        { entityId: { $in: sessionIds } },
        { 'details.revokedSessionId': { $in: sessionIds } },
      ],
    })
      .select('entityId details')
      .lean();

    revokedLogs.forEach((entry) => {
      if (entry.entityId) revokedIds.add(String(entry.entityId));
      if (entry.details?.revokedSessionId) revokedIds.add(String(entry.details.revokedSessionId));
    });
  }

  const now = Date.now();

  const data = logs.map((log) => {
    const user = log.userId;
    const ua = log.userAgent || '';
    let deviceType = 'desktop';
    if (/mobile|android|iphone|ipad/i.test(ua)) deviceType = 'mobile';
    else if (/laptop|macintosh|windows/i.test(ua)) deviceType = 'laptop';

    const id = log._id.toString();
    const loginAt = log.createdAt ? new Date(log.createdAt).getTime() : now;
    const isRevoked = revokedIds.has(id);
    const withinTokenTtl = now - loginAt <= SESSION_TTL_MS;
    const status = !isRevoked && withinTokenTtl ? 'active' : 'inactive';

    return {
      id,
      userId: user?._id?.toString() || log.userId?.toString() || '',
      userName: user?.name || 'Unknown',
      userEmail: user?.email || log.details?.email || '—',
      device: ua || 'Unknown',
      deviceType,
      ipAddress: log.ipAddress || '—',
      location: '—',
      lastActivity: log.createdAt?.toISOString() || new Date().toISOString(),
      status,
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
  const sessionId = req.params.id;
  const now = new Date();

  // Persist a revocation event so admin dashboards can reflect this action.
  await AuditLog.create({
    module: 'auth',
    action: 'session_revoked',
    entityType: 'session',
    entityId: String(sessionId),
    userId: req.user?.userId || undefined,
    severity: 'warning',
    details: {
      revokedSessionId: String(sessionId),
      reason: req.body?.reason || 'Revoked from admin dashboard',
      revokedBy: req.user?.email || req.user?.name || 'admin',
    },
    ipAddress: req.ip || req.connection?.remoteAddress,
    userAgent: req.get?.('user-agent'),
    createdAt: now,
  });

  res.json({
    success: true,
    data: {
      id: String(sessionId),
      status: 'inactive',
      revokedAt: now.toISOString(),
    },
    message: 'Session revoked successfully',
    meta: {
      requestId: req.id,
      timestamp: now.toISOString(),
    },
  });
});

module.exports = { getSessions, revokeSession };
