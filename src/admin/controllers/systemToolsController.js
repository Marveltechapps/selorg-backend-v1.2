/**
 * System Tools Controller
 * Handles server status, instances, restart, logs, performance
 */
const os = require('os');
const { asyncHandler } = require('../../core/middleware');
const cacheService = require('../../core/services/cache.service');
const ErrorLog = require('../models/ErrorLog');
const SystemPerformanceMetric = require('../models/SystemPerformanceMetric');
const mongoose = require('mongoose');
const logger = require('../../core/utils/logger');
const { getRecentBufferedLogs } = require('../../core/utils/memoryCircularLogTransport');
const { tailCombinedLog } = require('../../core/utils/tailWinstonLogFile');
const runtimePerformanceTracker = require('../../shared/services/runtimePerformanceTracker');

/**
 * Format uptime in human-readable string
 */
function formatUptime(seconds) {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const parts = [];
  if (d) parts.push(`${d} day${d !== 1 ? 's' : ''}`);
  if (h) parts.push(`${h} hour${h !== 1 ? 's' : ''}`);
  if (m || parts.length === 0) parts.push(`${m} min${m !== 1 ? 's' : ''}`);
  return parts.join(', ');
}

/**
 * Get server status (cluster health, CPU, memory, disk, services)
 * GET /admin/system/server-status
 */
const getServerStatus = asyncHandler(async (req, res) => {
  const cpus = os.cpus();
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;
  const memoryPercent = totalMem > 0 ? Math.round((usedMem / totalMem) * 100) : 0;

  // CPU usage from load average (1-min load / num CPUs as rough %)
  const loadAvg = os.loadavg();
  const cpuCount = cpus.length;
  const cpuLoad = loadAvg[0] || 0;
  const cpuPercent = Math.min(100, Math.round((cpuLoad / Math.max(1, cpuCount)) * 100));

  // Disk - Node doesn't have native disk stats; use a placeholder or require a package
  let diskPercent = 0;
  try {
    const { execSync } = require('child_process');
    const isWin = process.platform === 'win32';
    const cmd = isWin ? 'wmic logicaldisk get size,freespace' : 'df -h /';
    const out = execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] });
    if (!isWin && out) {
      const lines = out.trim().split('\n');
      if (lines[1]) {
        const parts = lines[1].split(/\s+/).filter(Boolean);
        if (parts[4]) diskPercent = parseInt(parts[4], 10) || 0;
      }
    }
  } catch {
    diskPercent = 0; // Unavailable when df/wmic fails
  }

  const uptimeSeconds = process.uptime();
  const uptimeStr = formatUptime(uptimeSeconds);

  // Services - represent Node process and key dependencies
  const services = [
    { name: 'API Server', status: 'running', uptime: uptimeStr, port: process.env.PORT || 5000 },
    { name: 'Database', status: mongoose.connection.readyState === 1 ? 'running' : 'error', uptime: uptimeStr },
    { name: 'Cache (in-memory)', status: 'running', uptime: uptimeStr },
  ];

  const data = {
    cpu: cpuPercent,
    memory: memoryPercent,
    disk: diskPercent,
    uptime: uptimeStr,
    services,
    lastUpdated: new Date().toISOString(),
  };

  res.json({ success: true, data });
});

/**
 * List server instances (current process; extend for PM2/cluster)
 * GET /admin/system/instances
 */
const listInstances = asyncHandler(async (req, res) => {
  const instances = [
    {
      id: `instance-${process.pid}`,
      pid: process.pid,
      status: 'running',
      cpu: Math.round(process.cpuUsage().user / 1000) || 0,
      memory: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      uptime: formatUptime(process.uptime()),
      lastRestart: new Date(Date.now() - process.uptime() * 1000).toISOString(),
    },
  ];

  res.json({ success: true, data: instances });
});

/**
 * Restart instance (requires permission - admin/super_admin via route)
 * POST /admin/system/instances/:id/restart
 */
const restartInstance = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const instanceId = `instance-${process.pid}`;

  if (id !== instanceId) {
    return res.status(404).json({
      success: false,
      error: 'Instance not found',
      message: `Instance ${id} does not exist or cannot be restarted from this process.`,
    });
  }

  logger.info('System Tools: restart requested by admin', { userId: req.user?.userId, instanceId });
  res.json({
    success: true,
    message: 'Restart initiated. The server will restart shortly.',
  });

  setImmediate(() => {
    process.exit(0);
  });
});

/**
 * Dedupe helper for merging log sources by rough identity
 */
function logDedupeKey(row) {
  return `${row.timestamp}\0${row.level}\0${row.service}\0${String(row.message).slice(0, 240)}`;
}

/**
 * System logs — live Winston ring buffer merged with persisted ErrorLog and file tail fallback
 * GET /admin/system/logs?service=&level=&limit=
 */
const getLogs = asyncHandler(async (req, res) => {
  const { service, level, limit = '100' } = req.query;
  const limitNum = Math.min(parseInt(String(limit), 10) || 100, 500);

  try {
    const buffered = getRecentBufferedLogs({
      limit: limitNum,
      level: typeof level === 'string' ? level : '',
      service: typeof service === 'string' ? service : '',
    });

    const seen = new Set(buffered.map(logDedupeKey));
    /** @type {Array<Record<string, unknown>>} */
    let extras = [];

    if (buffered.length < limitNum) {
      const remain = limitNum - buffered.length;
      const dbQuery = {};
      if (service && String(service).trim()) dbQuery.service = new RegExp(service.trim(), 'i');
      if (level && level !== 'all') dbQuery.level = level;

      const dbLogs = await ErrorLog.find(dbQuery).sort({ timestamp: -1 }).limit(remain).lean();
      extras = dbLogs
        .map((log) => ({
          id: log._id.toString(),
          timestamp:
            log.timestamp instanceof Date ? log.timestamp.toISOString() : String(log.timestamp || ''),
          level: log.level || 'error',
          service: log.service || 'selorg-backend',
          message: log.message || '',
          details:
            log.stack || log.details
              ? JSON.stringify(log.stack ?? log.details, null, 0)
              : undefined,
          correlation_id: log.correlation_id,
          stack: log.stack,
        }))
        .filter((row) => {
          const k = logDedupeKey(row);
          if (seen.has(k)) return false;
          seen.add(k);
          return true;
        });
    }

    /** @type {Array<Record<string, unknown>>} */
    let data = [...buffered, ...extras].sort((a, b) => {
      const ta = new Date(String(a.timestamp)).getTime();
      const tb = new Date(String(b.timestamp)).getTime();
      return tb - ta;
    });

    if (data.length === 0) {
      data = tailCombinedLog({ limit: limitNum, level, service });
    } else {
      data = data.slice(0, limitNum);
    }

    res.json({ success: true, data });
  } catch (err) {
    logger.warn('Failed to assemble system logs; returning buffer only', { error: String(err.message) });
    const fallback = getRecentBufferedLogs({
      limit: limitNum,
      level: typeof level === 'string' ? level : '',
      service: typeof service === 'string' ? service : '',
    });
    res.json({ success: true, data: fallback });
  }
});

/**
 * Get performance metrics
 * GET /admin/system/performance?limit=
 */
const getPerformanceMetrics = asyncHandler(async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit, 10) || 50, 100);

  const persisted = await SystemPerformanceMetric.find()
    .sort({ timestamp: -1 })
    .limit(limit)
    .lean();

  const persistedData = persisted.reverse().map((m) => ({
    timestamp: m.timestamp instanceof Date ? m.timestamp.toISOString() : m.timestamp,
    cpu: Number(m.cpu || 0),
    memory: Number(m.memory || 0),
    requests: Number(m.requests || 0),
    responseTime: Number(m.responseTime || m.latencyP95 || 0),
  }));

  const live = runtimePerformanceTracker.getLiveSnapshot();

  if (persistedData.length > 0) {
    const lastPersistedAt = new Date(persistedData[persistedData.length - 1].timestamp).getTime();
    const liveAt = new Date(live.timestamp).getTime();
    const merged = liveAt - lastPersistedAt > 20 * 1000
      ? [...persistedData, live]
      : persistedData.map((m, idx, arr) => (idx === arr.length - 1 ? { ...m, ...live } : m));

    const data = merged.slice(-limit).map((m) => ({
      timestamp: new Date(m.timestamp).toISOString().slice(11, 16),
      cpu: m.cpu,
      memory: m.memory,
      requests: m.requests,
      responseTime: m.responseTime,
    }));
    return res.json({ success: true, data });
  }

  res.json({
    success: true,
    data: [
      {
        timestamp: new Date(live.timestamp).toISOString().slice(11, 16),
        cpu: live.cpu,
        memory: live.memory,
        requests: live.requests,
        responseTime: live.responseTime,
      },
    ],
  });
});

/**
 * Cache stats (shim for system tools - maps to admin cache)
 */
const getCacheStats = asyncHandler(async (req, res) => {
  const stats = await cacheService.getStats();
  res.json({
    success: true,
    data: {
      totalKeys: stats.keysCount ?? 0,
      memoryUsed: stats.memoryUsed ?? 'N/A',
      hitRate: 0,
      missRate: 0,
      evictions: 0,
      connections: 0,
    },
  });
});

/**
 * Clear cache
 */
const clearCache = asyncHandler(async (req, res) => {
  const pattern = req.body?.pattern;
  const cleared = pattern
    ? await cacheService.delPattern(pattern)
    : (await cacheService.delPattern('*')) || 0;
  res.json({ success: true, cleared });
});

/**
 * Get API endpoints (stub - returns empty until wired to APM)
 */
const getApiEndpoints = asyncHandler(async (req, res) => {
  res.json({ success: true, data: [] });
});

/**
 * Get migrations (stub - returns empty until wired to migration runner)
 */
const getMigrations = asyncHandler(async (req, res) => {
  res.json({ success: true, data: [] });
});

module.exports = {
  getServerStatus,
  listInstances,
  restartInstance,
  getLogs,
  getPerformanceMetrics,
  getCacheStats,
  clearCache,
  getApiEndpoints,
  getMigrations,
};
