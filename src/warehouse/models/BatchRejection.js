const mongoose = require('mongoose');

const BatchRejectionSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true, index: true },
  batchId: { type: String, required: true },
  reason: { type: String, required: true },
  severity: { type: String, enum: ['low', 'medium', 'high', 'critical'], default: 'medium' },
  itemsCount: { type: Number },
  rejectedBy: { type: String },
  rejectedAt: { type: Date, default: Date.now }
}, { timestamps: true, collection: 'warehouse_batch_rejections' });

module.exports = mongoose.models.BatchRejection || mongoose.model('BatchRejection', BatchRejectionSchema);

