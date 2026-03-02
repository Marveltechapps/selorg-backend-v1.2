const mongoose = require('mongoose');
const { Schema } = mongoose;

const OpsSurgeConfigSchema = new Schema({
  cityId: { type: String, default: 'default', unique: true, index: true },
  active: { type: Boolean, default: false },
  globalMultiplier: { type: Number, default: 1.0, min: 1.0, max: 3.0 },
  zoneMultipliers: { type: Schema.Types.Mixed, default: {} },
  startTime: { type: Date, default: null },
  estimatedEnd: { type: Date, default: null },
  reason: { type: String, default: null },
  updatedBy: { type: String, default: null },
}, {
  timestamps: true,
  collection: 'ops_surge_config',
});

module.exports = mongoose.models.OpsSurgeConfig || mongoose.model('OpsSurgeConfig', OpsSurgeConfigSchema);
