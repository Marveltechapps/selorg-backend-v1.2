/**
 * PushToken model – from frontend YAML (api/push-tokens).
 * token, userId, platform (ios|android|web), deviceId.
 */
const mongoose = require('mongoose');

const pushTokenSchema = new mongoose.Schema(
  {
    userId: { type: String },
    token: { type: String, required: true },
    platform: { type: String, enum: ['ios', 'android', 'web'] },
    deviceId: { type: String },
  },
  { timestamps: true }
);

pushTokenSchema.index({ token: 1 });
pushTokenSchema.index({ userId: 1, deviceId: 1 });

module.exports = mongoose.model('PushToken', pushTokenSchema);
