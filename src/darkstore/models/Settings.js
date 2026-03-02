const mongoose = require('mongoose');

const SettingsSchema = new mongoose.Schema({
  store_id: {
    type: String,
    required: true,
    default: 'DS-Brooklyn-04',
    index: true,
  },
  refreshIntervals: {
    dashboard: { type: Number, default: 30, min: 5, max: 300 },
    alerts: { type: Number, default: 15, min: 5, max: 300 },
    orders: { type: Number, default: 10, min: 5, max: 300 },
    inventory: { type: Number, default: 20, min: 5, max: 300 },
    analytics: { type: Number, default: 30, min: 5, max: 300 },
  },
  storeMode: {
    type: String,
    enum: ['online', 'pause', 'maintenance'],
    default: 'online',
  },
  notifications: {
    enabled: { type: Boolean, default: true },
    sound: { type: Boolean, default: true },
    criticalOnly: { type: Boolean, default: false },
    email: { type: Boolean, default: false },
  },
  display: {
    theme: {
      type: String,
      enum: ['light', 'dark', 'auto'],
      default: 'light',
    },
    timeFormat: {
      type: String,
      enum: ['12h', '24h'],
      default: '24h',
    },
    dateFormat: {
      type: String,
      enum: ['MM/DD/YYYY', 'DD/MM/YYYY', 'YYYY-MM-DD'],
      default: 'MM/DD/YYYY',
    },
  },
  performance: {
    enableRealTimeUpdates: { type: Boolean, default: true },
    enableOptimisticUpdates: { type: Boolean, default: true },
    cacheTimeout: { type: Number, default: 60, min: 10, max: 300 },
  },
  outbound: {
    autoDispatchEnabled: { type: Boolean, default: true },
    autoDispatchThreshold: { type: Number, default: 5, min: 1, max: 20 },
    maxOrdersPerRider: { type: Number, default: 5, min: 1, max: 10 },
    enableRiderAutoAssignment: { type: Boolean, default: true },
  },
  lastUpdated: {
    type: Date,
    default: Date.now,
  },
  updatedBy: {
    type: String,
    default: 'system',
  },
}, {
  timestamps: true,
});

// Ensure one settings document per store
SettingsSchema.index({ store_id: 1 }, { unique: true });

module.exports = mongoose.models.Settings || mongoose.model('Settings', SettingsSchema);

