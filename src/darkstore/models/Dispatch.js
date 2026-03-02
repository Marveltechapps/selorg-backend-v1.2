const mongoose = require('mongoose');

const dispatchSchema = new mongoose.Schema(
  {
    dispatch_id: {
      type: String,
      required: true,
      unique: true,
    },
    rider_id: {
      type: String,
      required: false,
    },
    rider_name: {
      type: String,
      required: false,
    },
    status: {
      type: String,
      required: true,
      enum: ['waiting', 'assigned', 'delayed', 'in_transit'],
      default: 'waiting',
    },
    orders_count: {
      type: Number,
      required: true,
      default: 0,
    },
    eta: {
      type: String,
      required: false,
    },
    dispatch_type: {
      type: String,
      required: true,
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

dispatchSchema.index({ dispatch_id: 1 });
dispatchSchema.index({ store_id: 1, status: 1 });
dispatchSchema.index({ rider_id: 1 });

module.exports = mongoose.models.Dispatch || mongoose.model('Dispatch', dispatchSchema);

