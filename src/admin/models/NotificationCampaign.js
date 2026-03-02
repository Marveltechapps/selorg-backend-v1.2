/**
 * Admin notification campaign - push/email/SMS campaigns
 */
const mongoose = require('mongoose');

const NotificationCampaignSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    templateId: { type: mongoose.Schema.Types.ObjectId, ref: 'NotificationTemplate', required: true },
    templateName: { type: String },
    segment: {
      type: String,
      enum: ['all', 'vip', 'new', 'inactive', 'custom'],
      default: 'all',
    },
    customSegmentQuery: { type: String },
    status: {
      type: String,
      enum: ['draft', 'scheduled', 'active', 'paused', 'completed'],
      default: 'draft',
    },
    channels: [{ type: String, enum: ['push', 'sms', 'email', 'in-app'] }],
    scheduledAt: { type: Date },
    startedAt: { type: Date },
    completedAt: { type: Date },
    targetUsers: { type: Number, default: 0 },
    sentCount: { type: Number, default: 0 },
    deliveredCount: { type: Number, default: 0 },
    openedCount: { type: Number, default: 0 },
    clickedCount: { type: Number, default: 0 },
    deliveryRate: { type: Number, default: 0 },
    openRate: { type: Number, default: 0 },
    clickRate: { type: Number, default: 0 },
    createdBy: { type: String },
  },
  { timestamps: true }
);

NotificationCampaignSchema.index({ status: 1 });
NotificationCampaignSchema.index({ templateId: 1 });
NotificationCampaignSchema.index({ scheduledAt: 1 });

NotificationCampaignSchema.set('toJSON', {
  transform(doc, ret) {
    ret.id = ret._id.toString();
    ret.templateId = ret.templateId?.toString?.() ?? ret.templateId;
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});

module.exports =
  mongoose.models.NotificationCampaign ||
  mongoose.model('NotificationCampaign', NotificationCampaignSchema, 'admin_notification_campaigns');
