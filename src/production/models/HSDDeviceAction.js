const mongoose = require('mongoose');

const hsdDeviceActionSchema = new mongoose.Schema(
  {
    action_id: {
      type: String,
      required: true,
      unique: true,
    },
    device_id: {
      type: String,
      required: true,
    },
    user_id: {
      type: String,
      required: false,
    },
    user_name: {
      type: String,
      required: false,
    },
    event_type: {
      type: String,
      required: true,
      enum: ['scan_sku', 'qc_check', 'shelf_verification', 'system', 'error', 'system_control'],
    },
    details: {
      type: String,
      required: true,
    },
    result: {
      type: String,
      required: true,
      enum: ['success', 'warning', 'error', 'blocked', 'alert'],
    },
    timestamp: {
      type: String,
      required: true,
    },
    store_id: {
      type: String,
      required: true,
    },
  },
  {
    timestamps: false,
  }
);

hsdDeviceActionSchema.index({ device_id: 1, timestamp: -1 });
hsdDeviceActionSchema.index({ store_id: 1, timestamp: -1 });
hsdDeviceActionSchema.index({ event_type: 1 });

module.exports = mongoose.models.HSDDeviceAction || mongoose.model('HSDDeviceAction', hsdDeviceActionSchema);

