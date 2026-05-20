const mongoose = require('mongoose');
const { Schema } = mongoose;

const configSchema = new Schema({
  algorithm: { type: String, default: 'nearest_available' },
  riderSelection: { type: String, default: 'proximity' },
  batchingEnabled: { type: Boolean, default: true },
  surgePricingEnabled: { type: Boolean, default: true },
}, { _id: false });

const activityLogSchema = new Schema({
  timestamp: { type: Date, default: Date.now },
  action: { type: String, required: true },
  message: { type: String, default: '' },
  status: { type: String, enum: ['running', 'paused', 'error'], default: 'running' },
  userId: { type: String, default: null },
}, { _id: false });

const OpsDispatchConfigSchema = new Schema({
  cityId: { type: String, default: 'default', unique: true, index: true },
  status: {
    type: String,
    enum: ['running', 'paused', 'error'],
    default: 'running',
  },
  lastRestart: { type: Date, default: Date.now },
  slaTargetMinutes: { type: Number, default: 15 },
  config: { type: configSchema, default: () => ({}) },
  updatedBy: { type: String, default: null },
  activityLog: { type: [activityLogSchema], default: [] },
}, {
  timestamps: true,
  collection: 'ops_dispatch_config',
});

module.exports = mongoose.models.OpsDispatchConfig || mongoose.model('OpsDispatchConfig', OpsDispatchConfigSchema);
