const mongoose = require('mongoose');

const ReorderRequestSchema = new mongoose.Schema({
  warehouseKey: { type: String, trim: true, index: true },
  id: { type: String, required: true, index: true },
  sku: { type: String, required: true, trim: true, index: true },
  productName: { type: String, required: true, trim: true },
  quantity: { type: Number, required: true, min: 1 },
  priority: {
    type: String,
    required: true,
    enum: ['high', 'medium', 'low'],
    default: 'medium',
  },
  notes: { type: String, default: '', trim: true, maxlength: 500 },
  status: {
    type: String,
    required: true,
    enum: ['pending', 'ordered', 'fulfilled', 'cancelled'],
    default: 'pending',
    index: true,
  },
  alertId: { type: String, default: null, trim: true },
  requestedBy: { type: String, default: 'System', trim: true },
  timestamp: { type: Date, default: Date.now, index: true },
}, {
  timestamps: true,
  collection: 'reorder_requests',
});

ReorderRequestSchema.index({ warehouseKey: 1, id: 1 }, { unique: true });

module.exports =
  mongoose.models.ReorderRequest ||
  mongoose.model('ReorderRequest', ReorderRequestSchema);
