/**
 * Applications Management Controller
 * Handles /admin/applications/* for central app management (HHD, Picker, etc.)
 */
const Application = require('../models/Application');
const { asyncHandler } = require('../../core/middleware');
const axios = require('axios');
const logger = require('../../core/utils/logger');

const BASE_URL = (process.env.BASE_URL || process.env.API_BASE_URL || `http://localhost:${process.env.PORT || 5000}`).replace(/\/$/, '');

async function checkHealthAt(url) {
  try {
    const res = await axios.get(url, { timeout: 5000 });
    const data = res.data || {};
    // Picker: { ok: true, db: boolean }
    if (data.ok === true) {
      return data.db === true ? 'healthy' : data.db === false ? 'degraded' : 'healthy';
    }
    // HHD, Customer, Rider: { status: 'healthy' } or { ok: true }
    if (data.status === 'healthy' || (res.status === 200 && (data.ok === true || data.status === 'ok'))) {
      return 'healthy';
    }
    return res.status === 200 ? 'healthy' : 'degraded';
  } catch (err) {
    logger.warn('Health check failed', { url, error: err?.message });
    return 'down';
  }
}

async function getHealthForApp(app) {
  const checkableTypes = ['picker_app', 'hhd_app', 'customer_app', 'rider_app'];
  if (checkableTypes.includes(app.type)) {
    const url = `${app.baseUrl}${app.healthPath}`.replace(/([^:]\/)\/+/g, '$1');
    return checkHealthAt(url);
  }
  return app.lastHealthStatus ?? 'unknown';
}

function toApplicationResponse(doc, healthOverride) {
  const health = healthOverride ?? doc.lastHealthStatus ?? 'unknown';
  return {
    id: doc._id.toString(),
    name: doc.displayName || doc.name,
    type: doc.type,
    displayName: doc.displayName,
    description: doc.description || '',
    status: doc.enabled ? 'active' : 'inactive',
    health,
    config: doc.config || {},
    enabled: doc.enabled,
    lastSync: doc.lastHealthCheck ? new Date(doc.lastHealthCheck).toISOString() : null,
    lastHealthCheck: doc.lastHealthCheck ? new Date(doc.lastHealthCheck).toISOString() : null,
    baseUrl: doc.baseUrl,
    healthPath: doc.healthPath,
  };
}

const DEFAULT_APPS = [
  {
    type: 'customer_app',
    name: 'customer_app',
    displayName: 'Customer App (selorg-mobile)',
    description: 'Customer mobile app – browse, order, track deliveries',
    baseUrl: BASE_URL,
    healthPath: '/api/v1/customer/health',
    enabled: true,
  },
  {
    type: 'hhd_app',
    name: 'hhd_app',
    displayName: 'HHD App (selorg-scanner)',
    description: 'Handheld device scanner for warehouse operations',
    baseUrl: BASE_URL,
    healthPath: '/api/v1/hhd/health',
    enabled: true,
  },
  {
    type: 'picker_app',
    name: 'picker_app',
    displayName: 'Picker App',
    description: 'Picker app – profile, shifts, attendance, wallet, orders',
    baseUrl: BASE_URL,
    healthPath: '/api/v1/picker/health',
    enabled: true,
  },
  {
    type: 'rider_app',
    name: 'rider_app',
    displayName: 'Rider App',
    description: 'Rider mobile app – delivery fleet management',
    baseUrl: BASE_URL,
    healthPath: '/api/v1/rider/health',
    enabled: true,
  },
];

module.exports = {
  list: asyncHandler(async (req, res) => {
    let apps = await Application.find().sort({ type: 1 });
    if (apps.length === 0) {
      await Application.insertMany(DEFAULT_APPS);
      apps = await Application.find().sort({ type: 1 });
    }

    const result = [];
    for (const app of apps) {
      let health = app.lastHealthStatus;
      if (['picker_app', 'hhd_app', 'customer_app', 'rider_app'].includes(app.type)) {
        health = await getHealthForApp(app);
        await Application.findByIdAndUpdate(app._id, {
          lastHealthStatus: health,
          lastHealthCheck: new Date(),
        });
      }
      result.push(toApplicationResponse(app, health));
    }

    res.json({ success: true, data: result });
  }),

  getHealth: asyncHandler(async (req, res) => {
    const { id } = req.params;
    const app = await Application.findById(id);
    if (!app) return res.status(404).json({ success: false, error: 'Application not found' });

    let health = 'unknown';
    if (['picker_app', 'hhd_app', 'customer_app', 'rider_app'].includes(app.type)) {
      health = await getHealthForApp(app);
      await Application.findByIdAndUpdate(id, { lastHealthStatus: health, lastHealthCheck: new Date() });
    } else {
      health = app.lastHealthStatus ?? 'unknown';
    }

    res.json({ success: true, data: { health } });
  }),

  update: asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { status, config } = req.body;
    const update = {};
    if (status !== undefined) {
      const validStatus = ['active', 'inactive'];
      if (!validStatus.includes(status)) {
        return res.status(400).json({ success: false, error: 'Invalid status. Use active or inactive.' });
      }
      update.enabled = status === 'active';
    }
    if (config !== undefined && typeof config === 'object') {
      update.config = config;
    }
    const app = await Application.findByIdAndUpdate(id, update, { new: true });
    if (!app) return res.status(404).json({ success: false, error: 'Application not found' });
    res.json({ success: true, data: toApplicationResponse(app) });
  }),

  toggle: asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;
    const validStatus = ['active', 'inactive'];
    if (!validStatus.includes(status)) {
      return res.status(400).json({ success: false, error: 'Invalid status. Use active or inactive.' });
    }

    const enabled = status === 'active';
    const app = await Application.findByIdAndUpdate(id, { enabled }, { new: true });
    if (!app) return res.status(404).json({ success: false, error: 'Application not found' });

    res.json({ success: true, data: toApplicationResponse(app) });
  }),

  testConnection: asyncHandler(async (req, res) => {
    const { id } = req.params;
    const app = await Application.findById(id);
    if (!app) return res.status(404).json({ success: false, error: 'Application not found' });

    let health = 'unknown';
    if (['picker_app', 'hhd_app', 'customer_app', 'rider_app'].includes(app.type)) {
      health = await getHealthForApp(app);
      await Application.findByIdAndUpdate(id, { lastHealthStatus: health, lastHealthCheck: new Date() });
    } else {
      health = app.lastHealthStatus ?? 'unknown';
    }

    const message = health === 'healthy' ? 'Connection successful' : health === 'degraded' ? 'Service up but DB issue' : 'Connection failed';
    res.json({ success: true, data: { health, message } });
  }),
};
