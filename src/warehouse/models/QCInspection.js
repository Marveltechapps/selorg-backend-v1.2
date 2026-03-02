const mongoose = require('mongoose');

const QCInspectionSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true, index: true },
  inspectionId: { type: String, required: true },
  batchId: { type: String, required: true },
  productName: { type: String, required: true },
  inspector: { type: String, required: true },
  date: { type: Date, default: Date.now },
  status: { type: String, enum: ['pending', 'passed', 'failed'], default: 'pending' },
  score: { type: Number, min: 0, max: 100 },
  itemsInspected: { type: Number },
  defectsFound: { type: Number }
}, { timestamps: true, collection: 'warehouse_qc_inspections' });

module.exports = mongoose.models.QCInspection || mongoose.model('QCInspection', QCInspectionSchema);

