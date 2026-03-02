const mongoose = require('mongoose');

const networkStatusSchema = new mongoose.Schema(
  {
    status: {
      type: String,
      required: true,
    },
    signal_strength: {
      type: Number,
      required: true,
      min: 0,
      max: 100,
    },
    latency: {
      type: Number,
      required: true,
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

networkStatusSchema.index({ store_id: 1 });

module.exports = mongoose.models.NetworkStatus || mongoose.model('NetworkStatus', networkStatusSchema);

