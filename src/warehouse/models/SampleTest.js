const mongoose = require('mongoose');

const SampleTestSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true, index: true },
  sampleId: { type: String, required: true },
  productName: { type: String, required: true },
  batchId: { type: String },
  testType: { type: String },
  result: { type: String, enum: ['pass', 'fail', 'pending'], default: 'pending' },
  tester: { type: String },
  testDate: { type: Date, default: Date.now },
  reportUrl: { type: String }
}, { timestamps: true, collection: 'warehouse_sample_tests' });

module.exports = mongoose.models.SampleTest || mongoose.model('SampleTest', SampleTestSchema);

