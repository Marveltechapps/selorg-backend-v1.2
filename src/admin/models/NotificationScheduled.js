/**
 * Admin scheduled notifications - upcoming and recurring sends
 */
const mongoose = require('mongoose');

const NotificationScheduledSchema = new mongoose.Schema(
  {
    campaignId: { type: mongoose.Schema.Types.ObjectId, ref: 'NotificationCampaign' },
    campaignName: { type: String },
    templateName: { type: String },
    scheduledAt: { type: Date, required: true },
    targetUsers: { type: Number, default: 0 },
    channels: [{ type: String, enum: ['push', 'sms', 'email', 'in-app'] }],
    recurring: { type: String, enum: ['daily', 'weekly', 'monthly'] },
    status: {
      type: String,
      enum: ['pending', 'processing', 'sent', 'failed', 'cancelled'],
      default: 'pending',
    },
    createdBy: { type: String },
  },
  { timestamps: true }
);

NotificationScheduledSchema.index({ status: 1, scheduledAt: 1 });

NotificationScheduledSchema.set('toJSON', {
  transform(doc, ret) {
    ret.id = ret._id.toString();
    ret.campaignId = ret.campaignId?.toString?.() ?? ret.campaignId;
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});

module.exports =
  mongoose.models.NotificationScheduled ||
  mongoose.model('NotificationScheduled', NotificationScheduledSchema, 'admin_notification_scheduled');
