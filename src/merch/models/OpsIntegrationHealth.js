const mongoose = require('mongoose');
const { Schema } = mongoose;

const OpsIntegrationHealthSchema = new Schema({
  serviceKey: { type: String, required: true, index: true },
  displayName: { type: String, required: true },
  provider: { type: String, required: true },
  status: {
    type: String,
    enum: ['stable', 'latency', 'outage', 'unknown'],
    default: 'unknown',
  },
  lastCheckedAt: { type: Date, default: Date.now },
  latencyMs: { type: Number, default: null },
  message: { type: String, default: null },
  cityId: { type: String, default: 'default', index: true },
}, {
  timestamps: true,
  collection: 'ops_integration_health',
});

OpsIntegrationHealthSchema.index({ serviceKey: 1, cityId: 1 }, { unique: true });

module.exports = mongoose.models.OpsIntegrationHealth || mongoose.model('OpsIntegrationHealth', OpsIntegrationHealthSchema);
