/**
 * Admin notification history - log of every channel delivery attempt.
 */
const mongoose = require('mongoose');
const { CATEGORY_LIST } = require('../../customer-backend/constants/notificationCategories');

const NotificationHistorySchema = new mongoose.Schema(
  {
    userId: { type: String },
    userName: { type: String },
    templateName: { type: String },
    title: { type: String },
    body: { type: String },
    category: { type: String, enum: [...CATEGORY_LIST, null], default: null },
    channel: { type: String, enum: ['push', 'sms', 'email', 'whatsapp', 'in-app', 'web-push'] },
    status: {
      type: String,
      enum: ['sent', 'delivered', 'opened', 'clicked', 'failed', 'bounced', 'skipped', 'pending'],
      default: 'sent',
    },
    sentAt: { type: Date, default: Date.now },
    deliveredAt: { type: Date },
    openedAt: { type: Date },
    clickedAt: { type: Date },
    failureReason: { type: String },
    retryCount: { type: Number, default: 0 },
    notificationId: { type: mongoose.Schema.Types.ObjectId, ref: 'CustomerNotification' },
    campaignId: { type: mongoose.Schema.Types.ObjectId, ref: 'NotificationCampaign' },
    dedupeKey: { type: String, default: null },
  },
  { timestamps: true }
);

NotificationHistorySchema.index({ userId: 1, sentAt: -1 });
NotificationHistorySchema.index({ templateName: 1 });
NotificationHistorySchema.index({ status: 1 });
NotificationHistorySchema.index({ channel: 1 });
NotificationHistorySchema.index({ category: 1 });
NotificationHistorySchema.index({ sentAt: -1 });
NotificationHistorySchema.index({ campaignId: 1, status: 1 });
NotificationHistorySchema.index({ status: 1, retryCount: 1 });

NotificationHistorySchema.set('toJSON', {
  transform(doc, ret) {
    ret.id = ret._id.toString();
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});

module.exports =
  mongoose.models.NotificationHistory ||
  mongoose.model('NotificationHistory', NotificationHistorySchema, 'admin_notification_history');
