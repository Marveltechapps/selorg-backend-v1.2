/**
 * Admin notification template - reusable message templates for campaigns
 */
const mongoose = require('mongoose');

const NotificationTemplateSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    title: { type: String, required: true },
    body: { type: String, required: true },
    category: {
      type: String,
      enum: ['transactional', 'promotional', 'system', 'order', 'welcome'],
      default: 'promotional',
    },
    channels: [{ type: String, enum: ['push', 'sms', 'email', 'in-app'] }],
    variables: [{ type: String }],
    imageUrl: { type: String },
    deepLink: { type: String },
    priority: {
      type: String,
      enum: ['low', 'medium', 'high', 'critical'],
      default: 'medium',
    },
    status: {
      type: String,
      enum: ['active', 'inactive'],
      default: 'active',
    },
    totalSent: { type: Number, default: 0 },
  },
  { timestamps: true }
);

NotificationTemplateSchema.index({ status: 1 });
NotificationTemplateSchema.index({ category: 1 });

NotificationTemplateSchema.set('toJSON', {
  transform(doc, ret) {
    ret.id = ret._id.toString();
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});

module.exports =
  mongoose.models.NotificationTemplate ||
  mongoose.model('NotificationTemplate', NotificationTemplateSchema, 'admin_notification_templates');
