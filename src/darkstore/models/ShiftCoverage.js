const mongoose = require('mongoose');

const shiftCoverageSchema = new mongoose.Schema(
  {
    shift: {
      type: String,
      required: true,
    },
    shift_label: {
      type: String,
      required: true,
    },
    current_staff: {
      type: Number,
      required: true,
      default: 0,
    },
    target_staff: {
      type: Number,
      required: true,
    },
    status: {
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

shiftCoverageSchema.index({ store_id: 1, date: -1, shift: 1 });

module.exports = mongoose.models.ShiftCoverage || mongoose.model('ShiftCoverage', shiftCoverageSchema);

