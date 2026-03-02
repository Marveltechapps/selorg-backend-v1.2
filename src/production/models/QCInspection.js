const mongoose = require('mongoose');

const qcInspectionSchema = new mongoose.Schema(
  {
    inspection_id: {
      type: String,
      required: true,
      unique: true,
    },
    batch_id: {
      type: String,
      required: true,
    },
    product_name: {
      type: String,
      required: true,
    },
    inspector: {
      type: String,
      required: true,
    },
    date: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      required: true,
      enum: ['passed', 'failed', 'pending'],
    },
    score: {
      type: Number,
      required: true,
    },
    items_inspected: {
      type: Number,
      required: true,
    },
    defects_found: {
      type: Number,
      required: true,
    },
    check_type: { type: String },
    notes: { type: String },
    store_id: {
      type: String,
      required: false,
    },
    line_id: { type: String, required: false, index: true },
    factory_id: { type: String, required: false, index: true },
  },
  {
    timestamps: true,
  }
);

qcInspectionSchema.index({ store_id: 1, date: -1 });
qcInspectionSchema.index({ inspection_id: 1 });

module.exports = mongoose.models.QCInspection || mongoose.model('QCInspection', qcInspectionSchema);

