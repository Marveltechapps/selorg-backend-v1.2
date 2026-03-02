const mongoose = require('mongoose');

const qcCheckLogSchema = new mongoose.Schema(
  {
    sku: {
      type: String,
      required: true,
    },
    check_result: {
      type: String,
      required: true,
    },
    checked_at: {
      type: Date,
      required: true,
      default: Date.now,
    },
    checked_by: {
      type: String,
      required: true,
    },
    check_notes: {
      type: String,
      required: false,
    },
  },
  {
    timestamps: true,
  }
);

qcCheckLogSchema.index({ sku: 1, checked_at: -1 });

module.exports = mongoose.models.QCCheckLog || mongoose.model('QCCheckLog', qcCheckLogSchema);

