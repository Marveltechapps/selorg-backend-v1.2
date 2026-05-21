const os = require('os');

const WINDOW_MS = 60 * 1000;
const requests = [];

function prune(now = Date.now()) {
  const cutoff = now - WINDOW_MS;
  while (requests.length > 0 && requests[0].at < cutoff) {
    requests.shift();
  }
}

function recordRequest(durationMs) {
  const now = Date.now();
  const safeDuration = Number.isFinite(durationMs) && durationMs >= 0 ? Math.round(durationMs) : 0;
  requests.push({ at: now, durationMs: safeDuration });
  prune(now);
}

function getLiveSnapshot() {
  const now = Date.now();
  prune(now);

  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;
  const memoryPercent = totalMem > 0 ? Math.round((usedMem / totalMem) * 100) : 0;

  const cpuCount = Math.max(1, os.cpus().length);
  const cpuPercent = Math.min(100, Math.round(((os.loadavg()[0] || 0) / cpuCount) * 100));

  const requestCount = requests.length;
  const avgResponseTime = requestCount
    ? Math.round(requests.reduce((sum, r) => sum + r.durationMs, 0) / requestCount)
    : 0;

  return {
    timestamp: new Date(now).toISOString(),
    cpu: cpuPercent,
    memory: memoryPercent,
    requests: requestCount,
    responseTime: avgResponseTime,
  };
}

module.exports = {
  recordRequest,
  getLiveSnapshot,
};
