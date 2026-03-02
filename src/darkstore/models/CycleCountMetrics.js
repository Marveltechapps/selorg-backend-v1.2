const mongoose = require('mongoose');

const cycleCountMetricsSchema = new mongoose.Schema(
  {
    store_id: {
      type: String,
      required: true,
    },
    date: {
      type: String,
      required: true,
    },
    daily_count_progress: {
      percentage: {
        type: Number,
        required: true,
      },
      items_counted: {
        type: Number,
        required: true,
      },
      items_total: {
        type: Number,
        required: true,
      },
    },
    accuracy_rate: {
      percentage: {
        type: Number,
        required: true,
      },
      target: {
        type: Number,
        required: true,
      },
    },
    variance_value: {
      amount: {
        type: Number,
        required: true,
      },
      currency: {
        type: String,
        required: true,
        default: 'INR',
      },
      items_missing: {
        type: Number,
        required: true,
      },
      items_extra: {
        type: Number,
        required: true,
      },
    },
  },
  {
    timestamps: true,
  }
);

cycleCountMetricsSchema.index({ store_id: 1, date: 1 }, { unique: true });

module.exports = mongoose.models.CycleCountMetrics || mongoose.model('CycleCountMetrics', cycleCountMetricsSchema);

