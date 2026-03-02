const mongoose = require('mongoose');

const cycleCountHeatmapSchema = new mongoose.Schema(
  {
    zone_id: {
      type: String,
      required: true,
    },
    variance_level: {
      type: String,
      required: true,
      enum: ['high', 'medium', 'low'],
    },
    accuracy: {
      type: Number,
      required: true,
    },
    store_id: {
      type: String,
      required: true,
    },
    date: {
      type: String,
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

cycleCountHeatmapSchema.index({ store_id: 1, date: 1 });
cycleCountHeatmapSchema.index({ zone_id: 1 });

module.exports = mongoose.models.CycleCountHeatmap || mongoose.model('CycleCountHeatmap', cycleCountHeatmapSchema);

