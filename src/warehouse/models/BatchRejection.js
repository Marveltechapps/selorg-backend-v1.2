const mongoose = require('mongoose');

const BatchRejectionSchema = new mongoose.Schema({
  warehouseKey: { type: String, trim: true, index: true },
  id: { type: String, required: true, index: true },
  batchId: { type: String, required: true },
  reason: { type: String, required: true },
  severity: { type: String, enum: ['low', 'medium', 'high', 'critical'], default: 'medium' },
  itemsCount: { type: Number },
  rejectedBy: { type: String },
  rejectedAt: { type: Date, default: Date.now }
}, { timestamps: true, collection: 'warehouse_batch_rejections' });

BatchRejectionSchema.index({ warehouseKey: 1, id: 1 }, { unique: true });

module.exports = mongoose.models.BatchRejection || mongoose.model('BatchRejection', BatchRejectionSchema);

