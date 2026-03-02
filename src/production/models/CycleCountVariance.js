const mongoose = require('mongoose');

const cycleCountVarianceSchema = new mongoose.Schema(
  {
    sku: {
      type: String,
      required: true,
    },
    expected: {
      type: Number,
      required: true,
    },
    counted: {
      type: Number,
      required: true,
    },
    difference: {
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

cycleCountVarianceSchema.index({ store_id: 1, date: 1 });
cycleCountVarianceSchema.index({ sku: 1 });

module.exports = mongoose.models.CycleCountVariance || mongoose.model('CycleCountVariance', cycleCountVarianceSchema);

