/**
 * Feature Flag configuration
 */
const mongoose = require('mongoose');
const { Schema } = mongoose;

const FeatureFlagSchema = new Schema({
  name: { type: String, required: true },
  key: { type: String, required: true, unique: true },
  description: { type: String, default: '' },
  isEnabled: { type: Boolean, default: false },
  category: { type: String, enum: ['core', 'experimental', 'beta', 'premium'], default: 'core' },
  requiresRestart: { type: Boolean, default: false },
}, { timestamps: true });

FeatureFlagSchema.index({ key: 1 }, { unique: true });

module.exports = mongoose.models.FeatureFlag || mongoose.model('FeatureFlag', FeatureFlagSchema);
