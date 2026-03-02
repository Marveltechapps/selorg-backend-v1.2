const mongoose = require('mongoose');
const { Schema } = mongoose;

const SurgeConfigSchema = new Schema({
  key: { type: String, required: true, unique: true, default: 'default' },
  enabled: { type: Boolean, default: true },
}, { timestamps: true, collection: 'surge_config' });

module.exports = mongoose.models.SurgeConfig || mongoose.model('SurgeConfig', SurgeConfigSchema);
