const mongoose = require('mongoose');

const pushTokenSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'CustomerUser', required: true },
    token: { type: String, required: true },
    platform: { type: String, enum: ['ios', 'android', 'web'], default: 'android' },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

pushTokenSchema.index({ userId: 1, token: 1 }, { unique: true });
pushTokenSchema.index({ userId: 1, active: 1 });

const PushToken =
  mongoose.models.CustomerPushToken ||
  mongoose.model('CustomerPushToken', pushTokenSchema, 'customer_push_tokens');

module.exports = { PushToken };
