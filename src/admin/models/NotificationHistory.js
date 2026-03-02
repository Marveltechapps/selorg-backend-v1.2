/**
 * Admin notification history - log of sent notifications from campaigns
 */
const mongoose = require('mongoose');

const NotificationHistorySchema = new mongoose.Schema(
  {
    userId: { type: String },
    userName: { type: String },
    templateName: { type: String },
    title: { type: String },
    body: { type: String },
    channel: { type: String, enum: ['push', 'sms', 'email', 'in-app'] },
    status: {
      type: String,
      enum: ['sent', 'delivered', 'opened', 'clicked', 'failed', 'bounced'],
      default: 'sent',
    },
    sentAt: { type: Date, default: Date.now },
    deliveredAt: { type: Date },
    openedAt: { type: Date },
    clickedAt: { type: Date },
    failureReason: { type: String },
    campaignId: { type: mongoose.Schema.Types.ObjectId, ref: 'NotificationCampaign' },
  },
  { timestamps: true }
);

NotificationHistorySchema.index({ userId: 1, sentAt: -1 });
NotificationHistorySchema.index({ templateName: 1 });
NotificationHistorySchema.index({ status: 1 });
NotificationHistorySchema.index({ channel: 1 });
NotificationHistorySchema.index({ sentAt: -1 });

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
