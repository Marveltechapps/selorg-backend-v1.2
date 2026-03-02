/**
 * Application Controller - Applications Management
 * Handles /admin/applications/* endpoints
 */
const Application = require('../models/Application');
const { asyncHandler } = require('../../core/middleware');
const logger = require('../../core/utils/logger');

/**
 * Fetch health from remote URL
 * Rider backend uses /healthz, dashboard uses /health
 */
async function fetchHealth(baseUrl, healthPath = '/health') {
  const url = baseUrl.replace(/\/$/, '') + healthPath;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    clearTimeout(timeout);
    const data = await res.json().catch(() => ({}));
    const ok = res.ok && (data.status === 'ok' || data.status === 'healthy' || res.status === 200);
    return {
      healthy: !!ok,
      status: ok ? 'healthy' : 'down',
      message: data.message || (ok ? 'OK' : `HTTP ${res.status}`),
    };
  } catch (err) {
    logger.warn('Health check failed', { url, error: err.message });
    return { healthy: false, status: 'down', message: err.message || 'Unreachable' };
  }
}

function toApplicationDto(doc, healthResult = null) {
  const health = healthResult ?? (doc.lastHealthStatus ? { status: doc.lastHealthStatus } : { status: null });
  return {
    id: doc._id.toString(),
    type: doc.type,
    name: doc.name,
    displayName: doc.displayName,
    description: doc.description,
    baseUrl: doc.baseUrl,
    healthPath: doc.healthPath,
    enabled: doc.enabled,
    status: doc.enabled ? 'active' : 'inactive',
    health: health.status || 'unknown',
    lastHealthCheck: doc.lastHealthCheck ? doc.lastHealthCheck.toISOString() : null,
    lastHealthStatus: doc.lastHealthStatus,
  };
}

module.exports = {
  list: asyncHandler(async (req, res) => {
    let apps = await Application.find().sort({ type: 1 });
    if (apps.length === 0) {
      const base = process.env.API_BASE_URL || `http://localhost:${process.env.PORT || 5001}`;
      const riderUrl = process.env.RIDER_BACKEND_URL || base;
      // Rider standalone uses /healthz; unified server uses /health
      const riderHealthPath = process.env.RIDER_BACKEND_URL ? '/healthz' : '/health';
      await Application.insertMany([
        {
          type: 'rider_app',
          name: 'rider_app',
          displayName: 'Rider App',
          description: 'Expo Router rider mobile app - delivery fleet management',
          baseUrl: riderUrl,
          healthPath: riderHealthPath,
          enabled: true,
        },
        {
          type: 'dashboard',
          name: 'dashboard',
          displayName: 'Admin Dashboard',
          description: 'Central admin dashboard',
          baseUrl: base,
          healthPath: '/health',
          enabled: true,
        },
      ]);
      apps = await Application.find().sort({ type: 1 });
    }
    const list = apps.map((a) => toApplicationDto(a));
    res.json({ success: true, data: list });
  }),

  getHealth: asyncHandler(async (req, res) => {
    const { id } = req.params;
    const app = await Application.findById(id);
    if (!app) return res.status(404).json({ success: false, error: 'Application not found' });
    const result = await fetchHealth(app.baseUrl, app.healthPath);
    app.lastHealthCheck = new Date();
    app.lastHealthStatus = result.status;
    await app.save();
    res.json({
      success: true,
      data: {
        healthy: result.healthy,
        status: result.status,
        message: result.message,
        checkedAt: new Date().toISOString(),
      },
    });
  }),

  test: asyncHandler(async (req, res) => {
    const { id } = req.params;
    const app = await Application.findById(id);
    if (!app) return res.status(404).json({ success: false, error: 'Application not found' });
    const result = await fetchHealth(app.baseUrl, app.healthPath);
    app.lastHealthCheck = new Date();
    app.lastHealthStatus = result.status;
    await app.save();
    res.json({
      success: result.healthy,
      message: result.healthy ? `${app.displayName} is reachable and healthy` : result.message,
      data: { status: result.status },
    });
  }),

  toggle: asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { enabled } = req.body;
    const app = await Application.findByIdAndUpdate(id, { enabled: !!enabled }, { new: true });
    if (!app) return res.status(404).json({ success: false, error: 'Application not found' });
    res.json({ success: true, data: toApplicationDto(app) });
  }),

  update: asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { enabled } = req.body;
    const update = {};
    if (typeof enabled === 'boolean') update.enabled = enabled;
    const app = await Application.findByIdAndUpdate(id, update, { new: true });
    if (!app) return res.status(404).json({ success: false, error: 'Application not found' });
    res.json({ success: true, data: toApplicationDto(app) });
  }),
};
