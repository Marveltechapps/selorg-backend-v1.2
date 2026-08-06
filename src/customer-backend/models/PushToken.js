const mongoose = require('mongoose');

/**
 * Device / browser push subscriptions.
 * - Expo (ios/android): `token` is ExponentPushToken[...], tokenType `expo`
 * - FCM (ios/android): native device token, tokenType `fcm`
 * - Web Push: `token` is the subscription endpoint; `webSubscription` holds keys
 */
const pushTokenSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'CustomerUser', required: true },
    token: { type: String, required: true },
    platform: { type: String, enum: ['ios', 'android', 'web'], default: 'android' },
    /**
     * Delivery transport:
     * - expo → Expo Push API
     * - fcm  → Firebase Admin SDK
     * Web subscriptions leave this unset / unused.
     */
    tokenType: {
      type: String,
      enum: ['expo', 'fcm'],
      default: undefined,
    },
    active: { type: Boolean, default: true },
    /** Browser Web Push subscription payload (Chrome/Edge). */
    webSubscription: {
      endpoint: { type: String },
      expirationTime: { type: Number, default: null },
      keys: {
        p256dh: { type: String },
        auth: { type: String },
      },
    },
    userAgent: { type: String, default: null },
  },
  { timestamps: true }
);

pushTokenSchema.index({ userId: 1, token: 1 }, { unique: true });
pushTokenSchema.index({ userId: 1, active: 1 });
pushTokenSchema.index({ platform: 1, active: 1 });
pushTokenSchema.index({ tokenType: 1, active: 1 });

const PushToken =
  mongoose.models.CustomerPushToken ||
  mongoose.model('CustomerPushToken', pushTokenSchema, 'customer_push_tokens');

module.exports = { PushToken };
