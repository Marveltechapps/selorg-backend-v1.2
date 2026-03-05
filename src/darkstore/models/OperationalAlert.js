/**
 * OperationalAlert - Operations alerts for darkstore (SLA breach, picker inactive, device offline, multiple missing items)
 */
const mongoose = require('mongoose');

const operationalAlertSchema = new mongoose.Schema(
  {
    alertType: {
      type: String,
      required: true,
      enum: ['ORDER_SLA_BREACHED', 'PICKER_INACTIVE', 'DEVICE_OFFLINE', 'MULTIPLE_MISSING_ITEMS'],
    },
    storeId: { type: String, default: '' },
    orderId: { type: String, default: '' },
    pickerId: { type: String, default: '' },
    deviceId: { type: String, default: '' },
    title: { type: String, required: true },
    description: { type: String, default: '' },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
    status: {
      type: String,
      enum: ['open', 'acknowledged', 'resolved'],
      default: 'open',
    },
  },
  { timestamps: true, collection: 'operational_alerts' }
);

operationalAlertSchema.index({ storeId: 1, status: 1 });
operationalAlertSchema.index({ alertType: 1 });
operationalAlertSchema.index({ createdAt: -1 });

module.exports =
  mongoose.models.OperationalAlert || mongoose.model('OperationalAlert', operationalAlertSchema);
