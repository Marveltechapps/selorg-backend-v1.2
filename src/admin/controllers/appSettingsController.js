/**
 * Dashboard application preferences for admin users
 * GET/PUT /admin/app-settings
 */
const SystemConfig = require('../models/SystemConfig');
const { asyncHandler } = require('../../core/middleware');
const logger = require('../../core/utils/logger');

const APP_SETTINGS_KEY = 'dashboard_app_settings';

const DEFAULT_APP_SETTINGS = {
  refreshIntervals: {
    dashboard: 30,
    alerts: 15,
    orders: 10,
    inventory: 20,
    analytics: 30,
  },
  storeMode: 'online',
  notifications: {
    enabled: true,
    sound: true,
    criticalOnly: false,
    email: false,
  },
  display: {
    theme: 'light',
    timeFormat: '24h',
    dateFormat: 'MM/DD/YYYY',
  },
  performance: {
    enableRealTimeUpdates: true,
    enableOptimisticUpdates: true,
    cacheTimeout: 60,
  },
};

function mergeAppSettings(value) {
  const src = value && typeof value === 'object' ? value : {};
  return {
    refreshIntervals: {
      ...DEFAULT_APP_SETTINGS.refreshIntervals,
      ...(src.refreshIntervals || {}),
    },
    storeMode: ['online', 'pause', 'maintenance'].includes(src.storeMode)
      ? src.storeMode
      : DEFAULT_APP_SETTINGS.storeMode,
    notifications: {
      ...DEFAULT_APP_SETTINGS.notifications,
      ...(src.notifications || {}),
    },
    display: {
      ...DEFAULT_APP_SETTINGS.display,
      ...(src.display || {}),
    },
    performance: {
      ...DEFAULT_APP_SETTINGS.performance,
      ...(src.performance || {}),
    },
  };
}

function validateSettings(settings) {
  if (settings.refreshIntervals) {
    for (const [key, value] of Object.entries(settings.refreshIntervals)) {
      if (typeof value !== 'number' || value < 5 || value > 300) {
        const err = new Error(`Invalid refresh interval for ${key}. Must be between 5 and 300 seconds.`);
        err.statusCode = 400;
        throw err;
      }
    }
  }
  if (settings.storeMode && !['online', 'pause', 'maintenance'].includes(settings.storeMode)) {
    const err = new Error('Invalid store mode. Must be online, pause, or maintenance.');
    err.statusCode = 400;
    throw err;
  }
}

const getAppSettings = asyncHandler(async (req, res) => {
  const doc = await SystemConfig.findOne({ key: APP_SETTINGS_KEY }).lean();
  const settings = mergeAppSettings(doc?.value);
  res.status(200).json({
    success: true,
    settings,
    lastUpdated: doc?.updatedAt || null,
  });
});

const updateAppSettings = asyncHandler(async (req, res) => {
  const { settings: incoming } = req.body;
  if (!incoming || typeof incoming !== 'object') {
    return res.status(400).json({ success: false, error: 'Settings object is required' });
  }

  validateSettings(incoming);
  const currentDoc = await SystemConfig.findOne({ key: APP_SETTINGS_KEY }).lean();
  const merged = mergeAppSettings({ ...(currentDoc?.value || {}), ...incoming });

  const doc = await SystemConfig.findOneAndUpdate(
    { key: APP_SETTINGS_KEY },
    {
      $set: {
        key: APP_SETTINGS_KEY,
        value: merged,
        updatedBy: req.user?.id || req.user?.email || 'admin',
      },
    },
    { new: true, upsert: true }
  );

  logger.info('Admin app settings updated', { userId: req.user?.id });

  res.status(200).json({
    success: true,
    settings: mergeAppSettings(doc.value),
    lastUpdated: doc.updatedAt,
    message: 'Settings updated successfully',
  });
});

module.exports = {
  getAppSettings,
  updateAppSettings,
  DEFAULT_APP_SETTINGS,
  mergeAppSettings,
};
