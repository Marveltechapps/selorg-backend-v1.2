const mongoose = require('mongoose');

const featureFlagSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true },
    value: { type: mongoose.Schema.Types.Mixed, default: true },
    platform: { type: String, enum: ['ios', 'android', 'web', 'all'], default: 'all' },
    minAppVersion: String,
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

featureFlagSchema.index({ key: 1, isActive: 1 });
featureFlagSchema.index({ platform: 1 });

const FeatureFlag = mongoose.models.CustomerFeatureFlag || mongoose.model('CustomerFeatureFlag', featureFlagSchema, 'customer_feature_flags');
module.exports = { FeatureFlag };
