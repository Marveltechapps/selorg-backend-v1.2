const mongoose = require('mongoose');

const hsdSessionSchema = new mongoose.Schema(
  {
    session_id: {
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
      required: true,
    },
    user_name: {
      type: String,
      required: true,
    },
    task_type: {
      type: String,
      required: true,
      enum: ['picking', 'packing', 'qc', 'cycle_count'],
    },
    task_id: {
      type: String,
      required: true,
    },
    current_status: {
      type: String,
      required: true,
    },
    zone: {
      type: String,
      required: false,
    },
    started_at: {
      type: String,
      required: true,
    },
    last_activity: {
      type: String,
      required: true,
    },
    items_completed: {
      type: Number,
      default: 0,
    },
    items_total: {
      type: Number,
      default: 0,
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

hsdSessionSchema.index({ device_id: 1 });
hsdSessionSchema.index({ store_id: 1, task_type: 1 });
hsdSessionSchema.index({ session_id: 1 });

module.exports = mongoose.models.HSDSession || mongoose.model('HSDSession', hsdSessionSchema);

