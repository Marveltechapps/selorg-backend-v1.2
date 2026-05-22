const mongoose = require('mongoose');

const QCMeasurementSchema = new mongoose.Schema({
  attribute: { type: String, required: true },
  expectedRange: String,
  observedValue: Number,
});

const QCCheckSchema = new mongoose.Schema(
  {
    vendorId: { type: String, required: true },
    batchId: { type: String, required: true },
    productName: String,
    checkType: { type: String, default: 'Visual' },
    result: { type: String, enum: ['Pass', 'Fail', 'Pending', 'pass', 'fail', 'pending'], default: 'Pending' },
    inspectorName: String,
    inspectorId: String,
    status: { type: String, default: 'pending' },
    measurements: [QCMeasurementSchema],
    notes: String,
    attachments: [String],
    hubKey: { type: String, trim: true, index: true },
  },
  { timestamps: true }
);

module.exports = mongoose.models.QCCheck || mongoose.model('QCCheck', QCCheckSchema);

