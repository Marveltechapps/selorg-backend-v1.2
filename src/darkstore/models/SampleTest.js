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
    result: {
      type: String,
      required: true,
      enum: ['pass', 'fail', 'pending'],
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

