const mongoose = require('mongoose');

const pickPackTaskSchema = new mongoose.Schema(
  {
    pick_pack_task_id: {
      type: String,
      required: true,
      unique: true,
    },
    request_id: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      required: true,
      default: 'pending',
    },
    picked: {
      type: Number,
      required: true,
      default: 0,
    },
    total: {
      type: Number,
      required: true,
      default: 0,
    },
    picker: {
      id: {
        type: String,
        required: false,
      },
      name: {
        type: String,
        required: false,
      },
    },
    vehicle_id: {
      type: String,
      required: false,
    },
    estimated_completion: {
      type: String,
      required: false,
    },
    store_id: {
      type: String,
      required: true,
    },
    created_at: {
      type: String,
      required: true,
    },
    updated_at: {
      type: String,
      required: true,
    },
  },
  {
    timestamps: false,
  }
);

pickPackTaskSchema.index({ pick_pack_task_id: 1 });
pickPackTaskSchema.index({ request_id: 1 });
pickPackTaskSchema.index({ store_id: 1, status: 1 });

module.exports = mongoose.models.PickPackTask || mongoose.model('PickPackTask', pickPackTaskSchema);

