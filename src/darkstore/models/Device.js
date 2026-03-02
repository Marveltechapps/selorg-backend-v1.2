const mongoose = require('mongoose');

const deviceSchema = new mongoose.Schema(
  {
    device_id: {
      type: String,
      required: true,
      unique: true,
    },
    device_type: {
      type: String,
      required: true,
    },
    serial_number: {
      type: String,
      required: false,
    },
    firmware_version: {
      type: String,
      required: false,
    },
    assigned_to: {
      userId: {
        type: String,
        required: false,
      },
      userName: {
        type: String,
        required: false,
      },
      userType: {
        type: String,
        enum: ['Picker', 'Packer', 'Rider', 'Spare'],
        required: false,
      },
    },
    battery_level: {
      type: Number,
      required: false,
      min: 0,
      max: 100,
    },
    signal_strength: {
      type: String,
      enum: ['strong', 'good', 'weak', 'no_signal'],
      required: false,
    },
    status: {
      type: String,
      required: true,
      enum: ['online', 'offline', 'charging', 'error', 'Active', 'Offline'],
    },
    last_seen: {
      type: Date,
      required: false,
    },
    last_sync: {
      type: String,
      required: false,
    },
    store_id: {
      type: String,
      required: false,
    },
  },
  {
    timestamps: true,
  }
);

deviceSchema.index({ store_id: 1, device_type: 1 });
deviceSchema.index({ store_id: 1, status: 1 });
deviceSchema.index({ device_id: 1 });

module.exports = mongoose.models.Device || mongoose.model('Device', deviceSchema);

