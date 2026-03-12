/**
 * Picker Config Service
 * Centralized config for Picker app - pay rates, geo, document limits, etc.
 * Stored in SystemConfig with key 'picker_config'.
 */
const SystemConfig = require('../../admin/models/SystemConfig');

const DEFAULTS = {
  // Pay & fees (₹)
  basePayPerHour: 100,
  overtimeMultiplier: 1.25,
  currency: 'INR',

  // Operational rules
  shiftGeoRadiusKm: 3,
  walkInBufferMinutes: 15,
  defaultShiftDurationHours: 8,

  // Document upload limits
  documentMaxSizeBytes: 10 * 1024 * 1024, // 10MB
  documentMinDimensionPx: 200,
  documentAllowedExtensions: ['.jpg', '.jpeg', '.png', '.pdf'],

  // Timeouts & intervals (ms)
  heartbeatIntervalMs: 30 * 1000, // 30 seconds
  websocketTimeoutMs: 10000,
  websocketReconnectionAttempts: 3,
  websocketReconnectionDelayMs: 5000,
  websocketReconnectionDelayMaxMs: 15000,

  // Display (when hub not yet selected)
  defaultHubName: 'Downtown Hub',
};

/**
 * Get picker config (for app consumption). Merges DB with defaults.
 * @returns {Promise<object>}
 */
async function getConfig() {
  let doc = await SystemConfig.findOne({ key: 'picker_config' }).lean();
  const value = doc?.value || {};
  return { ...DEFAULTS, ...value };
}

/**
 * Get picker config for admin (full object for editing).
 */
async function getConfigForAdmin() {
  return getConfig();
}

/**
 * Update picker config (admin only). Partial update.
 * @param {object} updates - Partial config to merge
 */
async function updateConfig(updates) {
  const current = await getConfig();
  const merged = { ...current, ...updates };

  await SystemConfig.findOneAndUpdate(
    { key: 'picker_config' },
    { $set: { value: merged } },
    { upsert: true, new: true }
  );
  return merged;
}

/**
 * Get pay rates for attendance/earnings calculations.
 */
async function getPayRates() {
  const config = await getConfig();
  return {
    basePayPerHour: Number(config.basePayPerHour) || DEFAULTS.basePayPerHour,
    overtimeMultiplier: Number(config.overtimeMultiplier) || DEFAULTS.overtimeMultiplier,
  };
}

/**
 * Get shift geo radius (km) for available shifts.
 */
async function getShiftGeoRadiusKm() {
  const config = await getConfig();
  const v = Number(config.shiftGeoRadiusKm);
  return !isNaN(v) && v > 0 ? v : DEFAULTS.shiftGeoRadiusKm;
}

module.exports = {
  getConfig,
  getConfigForAdmin,
  updateConfig,
  getPayRates,
  getShiftGeoRadiusKm,
  DEFAULTS,
};
