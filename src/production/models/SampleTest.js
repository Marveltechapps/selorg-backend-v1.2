const mongoose = require('mongoose');

const sampleTestSchema = new mongoose.Schema(
  {
    sample_id: {
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
    test_type: {
      type: String,
      required: true,
    },
    source: { type: String },
    priority: { type: String, enum: ['low', 'normal', 'high'], default: 'normal' },
    status: { type: String, enum: ['pending', 'in-progress', 'completed', 'failed'], default: 'pending' },
    result: {
      type: String,
      required: false,
      enum: ['pass', 'fail', 'pending'],
    },
    received_date: { type: String },
    completed_date: { type: String },
    result_notes: {
      type: String,
      required: false,
    },
    tested_by: {
      type: String,
      required: true,
    },
    date: {
      type: String,
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

sampleTestSchema.index({ store_id: 1, date: -1 });
sampleTestSchema.index({ sample_id: 1 });

module.exports = mongoose.models.SampleTest || mongoose.model('SampleTest', sampleTestSchema);

