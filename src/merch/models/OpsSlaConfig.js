const mongoose = require('mongoose');
const { Schema } = mongoose;

const OpsSlaConfigSchema = new Schema({
  cityId: { type: String, default: 'default', unique: true, index: true },
  targetMinutes: { type: Number, default: 15 },
  zoneOverrides: { type: Schema.Types.Mixed, default: {} },
}, {
  timestamps: true,
  collection: 'ops_sla_config',
});

module.exports = mongoose.models.OpsSlaConfig || mongoose.model('OpsSlaConfig', OpsSlaConfigSchema);
