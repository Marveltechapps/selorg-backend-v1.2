const mongoose = require('mongoose');

/**
 * In-app feed for the logistics / rider dashboard (web).
 * Scoped by hub/warehouse key from JWT; readByUserIds tracks per-user read state.
 */
const RiderDashboardNotificationSchema = new mongoose.Schema(
  {
    scopeKey: { type: String, trim: true, index: true, default: 'global' },
    title: { type: String, required: true },
    body: { type: String, default: '' },
    category: {
      type: String,
      enum: ['dispatch', 'order', 'alert', 'fleet', 'escalation', 'hr', 'system'],
      default: 'system',
    },
    channel: { type: String, enum: ['in-app'], default: 'in-app' },
    refType: { type: String },
    refId: { type: String },
    readByUserIds: { type: [String], default: [] },
  },
  { timestamps: true, collection: 'rider_dashboard_notifications' }
);

RiderDashboardNotificationSchema.index({ scopeKey: 1, createdAt: -1 });

module.exports =
  mongoose.models.RiderDashboardNotification ||
  mongoose.model('RiderDashboardNotification', RiderDashboardNotificationSchema);
