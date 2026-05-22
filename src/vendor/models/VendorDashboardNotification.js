const mongoose = require('mongoose');

/**
 * In-app feed for vendor control tower dashboard.
 */
const VendorDashboardNotificationSchema = new mongoose.Schema(
  {
    hubKey: { type: String, trim: true, index: true },
    title: { type: String, required: true },
    body: { type: String, default: '' },
    category: {
      type: String,
      enum: [
        'onboarding',
        'purchase_order',
        'inbound',
        'inventory',
        'qc',
        'approval',
        'alert',
        'finance',
        'system',
      ],
      default: 'system',
    },
    channel: { type: String, enum: ['in-app'], default: 'in-app' },
    refType: { type: String },
    refId: { type: String },
    readByUserIds: { type: [String], default: [] },
  },
  { timestamps: true, collection: 'vendor_dashboard_notifications' }
);

VendorDashboardNotificationSchema.index({ hubKey: 1, createdAt: -1 });

module.exports =
  mongoose.models.VendorDashboardNotification ||
  mongoose.model('VendorDashboardNotification', VendorDashboardNotificationSchema);
