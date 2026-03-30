const mongoose = require('mongoose');

/**
 * In-app feed for warehouse dashboard (GRN, inventory events, etc.).
 * readByUserIds tracks per-user read state for the shared feed.
 */
const WarehouseNotificationSchema = new mongoose.Schema(
  {
    warehouseKey: { type: String, trim: true, index: true },
    title: { type: String, required: true },
    body: { type: String, default: '' },
    category: {
      type: String,
      enum: ['inbound', 'inventory', 'outbound', 'qc', 'workforce', 'equipment', 'exception', 'system'],
      default: 'system',
    },
    channel: { type: String, enum: ['in-app'], default: 'in-app' },
    refType: { type: String },
    refId: { type: String },
    readByUserIds: { type: [String], default: [] },
  },
  { timestamps: true, collection: 'warehouse_notifications' }
);

WarehouseNotificationSchema.index({ warehouseKey: 1, createdAt: -1 });

module.exports =
  mongoose.models.WarehouseNotification ||
  mongoose.model('WarehouseNotification', WarehouseNotificationSchema);
