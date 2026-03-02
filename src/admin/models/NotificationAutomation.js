/**
 * Admin automation rules - trigger-based notifications
 */
const mongoose = require('mongoose');

const NotificationAutomationSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    trigger: {
      type: String,
      enum: ['order_placed', 'order_delivered', 'cart_abandoned', 'user_signup', 'payment_failed'],
      required: true,
    },
    templateId: { type: mongoose.Schema.Types.ObjectId, ref: 'NotificationTemplate', required: true },
    templateName: { type: String },
    delay: { type: Number, default: 0 },
    channels: [{ type: String, enum: ['push', 'sms', 'email', 'in-app'] }],
    conditions: { type: String },
    status: {
      type: String,
      enum: ['active', 'inactive'],
      default: 'active',
    },
    totalTriggered: { type: Number, default: 0 },
    successRate: { type: Number, default: 0 },
  },
  { timestamps: true }
);

NotificationAutomationSchema.index({ status: 1 });
NotificationAutomationSchema.index({ trigger: 1 });

NotificationAutomationSchema.set('toJSON', {
  transform(doc, ret) {
    ret.id = ret._id.toString();
    ret.templateId = ret.templateId?.toString?.() ?? ret.templateId;
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});

module.exports =
  mongoose.models.NotificationAutomation ||
  mongoose.model('NotificationAutomation', NotificationAutomationSchema, 'admin_notification_automation');
