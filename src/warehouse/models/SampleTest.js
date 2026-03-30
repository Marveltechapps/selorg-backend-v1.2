const mongoose = require('mongoose');

const SampleTestSchema = new mongoose.Schema({
  warehouseKey: { type: String, trim: true, index: true },
  id: { type: String, required: true, index: true },
  sampleId: { type: String, required: true },
  productName: { type: String, required: true },
  batchId: { type: String },
  testType: { type: String },
  result: { type: String, enum: ['pass', 'fail', 'pending'], default: 'pending' },
  tester: { type: String },
  testDate: { type: Date, default: Date.now },
  reportUrl: { type: String }
}, { timestamps: true, collection: 'warehouse_sample_tests' });

SampleTestSchema.index({ warehouseKey: 1, id: 1 }, { unique: true });

module.exports = mongoose.models.SampleTest || mongoose.model('SampleTest', SampleTestSchema);

