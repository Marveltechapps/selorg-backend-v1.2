const mongoose = require('mongoose');

const staffSchema = new mongoose.Schema(
  {
    staff_id: {
      type: String,
      required: true,
      unique: true,
    },
    store_id: {
      type: String,
      required: true,
    },
    name: {
      type: String,
      required: true,
    },
    role: {
      type: String,
      required: true,
    },
    department: {
      type: String,
      required: false,
    },
    zone: {
      type: String,
      required: false,
    },
    status: {
      type: String,
      required: true,
      enum: ['Active', 'Break', 'Offline', 'Meeting'],
      default: 'Offline',
    },
    current_shift: {
      type: String,
      required: false,
    },
    current_task: {
      type: String,
      required: false,
    },
    shift_start: {
      type: Date,
      required: false,
    },
    shift_end: {
      type: Date,
      required: false,
    },
    is_active: {
      type: Boolean,
      default: true,
    },
    current_load: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
staffSchema.index({ store_id: 1, role: 1, is_active: 1 });
staffSchema.index({ store_id: 1, status: 1 });
staffSchema.index({ store_id: 1, zone: 1 });

module.exports = mongoose.models.Staff || mongoose.model('Staff', staffSchema);

