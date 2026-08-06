const mongoose = require('mongoose');
const { CATEGORY_LIST } = require('../constants/notificationCategories');

const notificationSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'CustomerUser', required: true },
    title: { type: String, required: true },
    body: { type: String, default: '' },
    read: { type: Boolean, default: false },
    category: {
      type: String,
      enum: CATEGORY_LIST,
      default: 'system',
      index: true,
    },
    data: { type: mongoose.Schema.Types.Mixed, default: {} },
    /**
     * Idempotency key for events that must notify exactly once.
     * Unique partial index prevents duplicate inbox + channel fan-out.
     */
    dedupeKey: { type: String, default: null },
    /**
     * When true, row exists only for idempotency (excluded from inbox).
     */
    suppressed: { type: Boolean, default: false },
    /** Last known delivery summary for analytics / retry. */
    deliveryStatus: {
      type: String,
      enum: ['pending', 'partial', 'delivered', 'failed', 'skipped'],
      default: 'pending',
    },
    retryCount: { type: Number, default: 0 },
    failureReason: { type: String, default: null },
    channelsAttempted: [{ type: String }],
    channelsDelivered: [{ type: String }],
  },
  { timestamps: true }
);

notificationSchema.index({ userId: 1, createdAt: -1 });
notificationSchema.index({ userId: 1, read: 1 });
notificationSchema.index({ userId: 1, category: 1, createdAt: -1 });
notificationSchema.index({ userId: 1, suppressed: 1, createdAt: -1 });
notificationSchema.index(
  { dedupeKey: 1 },
  { unique: true, partialFilterExpression: { dedupeKey: { $type: 'string' } } }
);

const Notification =
  mongoose.models.CustomerNotification ||
  mongoose.model('CustomerNotification', notificationSchema, 'customer_notifications');

module.exports = { Notification };
