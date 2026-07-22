const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'CustomerUser', required: true },
    title: { type: String, required: true },
    body: { type: String, default: '' },
    read: { type: Boolean, default: false },
    data: { type: mongoose.Schema.Types.Mixed, default: {} },
    /**
     * Idempotency key for events that must notify exactly once (e.g. payment
     * outcomes: `payment-outcome:<orderId>:<TYPE>`). Enforced by a unique
     * partial index so concurrent callback/webhook/reconcile handlers can
     * never insert a duplicate. Null/absent for ordinary notifications.
     */
    dedupeKey: { type: String, default: null },
  },
  { timestamps: true }
);

notificationSchema.index({ userId: 1, createdAt: -1 });
notificationSchema.index({ userId: 1, read: 1 });
notificationSchema.index(
  { dedupeKey: 1 },
  { unique: true, partialFilterExpression: { dedupeKey: { $type: 'string' } } }
);

const Notification =
  mongoose.models.CustomerNotification ||
  mongoose.model('CustomerNotification', notificationSchema, 'customer_notifications');

module.exports = { Notification };
