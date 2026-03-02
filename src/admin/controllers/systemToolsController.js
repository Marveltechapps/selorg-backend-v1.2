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

// In-memory request metrics for performance (simple aggregation)
const requestMetrics = { count: 0, responseTimes: [], lastReset: Date.now() };

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
 * Get error logs
 * GET /admin/system/logs?service=&level=&limit=
 */
const getLogs = asyncHandler(async (req, res) => {
  const { service, level, limit = 100 } = req.query;
  const query = {};
  if (service) query.service = new RegExp(service, 'i');
  if (level) query.level = level;

  const logs = await ErrorLog.find(query)
    .sort({ timestamp: -1 })
    .limit(Math.min(parseInt(limit, 10) || 100, 500))
    .lean();

  const data = logs.map((log) => ({
    id: log._id.toString(),
    timestamp: log.timestamp,
    level: log.level,
    service: log.service,
    message: log.message,
    details: log.stack || log.details ? JSON.stringify(log.stack || log.details) : undefined,
    correlation_id: log.correlation_id,
    stack: log.stack,
  }));

  res.json({ success: true, data });
});

/**
 * Get performance metrics
 * GET /admin/system/performance?limit=
 */
const getPerformanceMetrics = asyncHandler(async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit, 10) || 50, 100);

  const metrics = await SystemPerformanceMetric.find()
    .sort({ timestamp: -1 })
    .limit(limit)
    .lean();

  if (metrics.length > 0) {
    const data = metrics.reverse().map((m) => ({
      timestamp: m.timestamp instanceof Date ? m.timestamp.toISOString().slice(11, 16) : m.timestamp,
      cpu: m.cpu,
      memory: m.memory,
      requests: m.requests,
      responseTime: m.responseTime || m.latencyP95,
    }));
    return res.json({ success: true, data });
  }

  // Fallback: compute from current process
  const usage = process.memoryUsage();
  const totalMem = os.totalmem();
  const usedMem = totalMem - os.freemem();
  const memoryPercent = totalMem > 0 ? Math.round((usage.heapUsed / totalMem) * 100) : 0;
  const data = [
    {
      timestamp: new Date().toISOString().slice(11, 16),
      cpu: Math.round((os.loadavg()[0] / Math.max(1, os.cpus().length)) * 100),
      memory: memoryPercent,
      requests: requestMetrics.count,
      responseTime: requestMetrics.responseTimes.length
        ? Math.round(
            requestMetrics.responseTimes.reduce((a, b) => a + b, 0) / requestMetrics.responseTimes.length
          )
        : 0,
    },
  ];

  res.json({ success: true, data });
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
