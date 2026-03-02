const mongoose = require('mongoose');

const peakHourAlertSchema = new mongoose.Schema(
  {
    enabled: {
      type: Boolean,
      required: true,
      default: false,
    },
    time_range: {
      type: String,
      required: true,
    },
    recommended_staff: {
      type: Number,
      required: true,
    },
    message: {
      type: String,
      required: true,
    },
    date: {
      type: Date,
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

peakHourAlertSchema.index({ store_id: 1, date: -1 });

module.exports = mongoose.models.PeakHourAlert || mongoose.model('PeakHourAlert', peakHourAlertSchema);

