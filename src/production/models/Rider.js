const mongoose = require('mongoose');

const riderSchema = new mongoose.Schema(
  {
    rider_id: {
      type: String,
      required: true,
      unique: true,
    },
    rider_name: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      required: true,
      enum: ['online', 'offline', 'busy', 'waiting'],
      default: 'online',
    },
    location: {
      lat: {
        type: Number,
        required: false,
      },
      lng: {
        type: Number,
        required: false,
      },
    },
    current_orders: {
      type: Number,
      required: true,
      default: 0,
    },
    max_capacity: {
      type: Number,
      required: true,
      default: 5,
    },
    store_id: {
      type: String,
      required: true,
    },
    last_update: {
      type: String,
      required: true,
    },
  },
  {
    timestamps: false,
  }
);

riderSchema.index({ rider_id: 1 });
riderSchema.index({ store_id: 1, status: 1 });

module.exports = mongoose.models.Rider || mongoose.model('Rider', riderSchema);

