const mongoose = require('mongoose');

const hsdUserLoginSchema = new mongoose.Schema(
  {
    session_id: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    phone_number: {
      type: String,
      required: true,
      index: true,
    },
    user_id: {
      type: String,
      required: true,
      index: true,
    },
    user_name: {
      type: String,
      default: null,
    },
    device_id: {
      type: String,
      default: null,
      index: true,
    },
    device_type: {
      type: String,
      default: null,
    },
    device_serial: {
      type: String,
      default: null,
    },
    store_id: {
      type: String,
      required: true,
      index: true,
    },
    login_at: {
      type: Date,
      required: true,
      index: true,
    },
    logout_at: {
      type: Date,
      default: null,
    },
    last_activity_at: {
      type: Date,
      required: true,
    },
    status: {
      type: String,
      enum: ['active', 'logged_out'],
      default: 'active',
      index: true,
    },
    /** Display label for dashboard: tied to login status (Assigned / Not Assigned). */
    device_information: {
      type: String,
      enum: ['Assigned', 'Not Assigned'],
      default: 'Assigned',
    },
    source: {
      type: String,
      enum: ['hhd', 'picker', 'dashboard'],
      default: 'hhd',
    },
    logout_reason: {
      type: String,
      enum: ['user_logout', 'session_expired', 'device_change', 'duplicate_login', 'admin', null],
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

hsdUserLoginSchema.index({ store_id: 1, status: 1, login_at: -1 });
hsdUserLoginSchema.index({ store_id: 1, phone_number: 1, login_at: -1 });
hsdUserLoginSchema.index({ user_id: 1, status: 1 });

module.exports =
  mongoose.models.HSDUserLogin || mongoose.model('HSDUserLogin', hsdUserLoginSchema);
