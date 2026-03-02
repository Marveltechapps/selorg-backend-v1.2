const mongoose = require('mongoose');

const WarehouseExceptionSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true, index: true },
  priority: { type: String, enum: ['low', 'medium', 'high', 'critical'], default: 'medium' },
  category: { type: String, enum: ['inbound', 'outbound', 'inventory', 'technical', 'qc', 'other'], required: true },
  title: { type: String, required: true },
  description: { type: String, required: true },
  relatedId: { type: String }, // e.g., GRN-001 or PICK-001
  relatedType: { type: String }, // e.g., 'grn', 'picklist', 'batch'
  status: { type: String, enum: ['open', 'investigating', 'resolved', 'closed'], default: 'open' },
  reportedBy: { type: String, required: true },
  reportedAt: { type: Date, default: Date.now },
  resolvedAt: { type: Date },
  resolutionNotes: { type: String }
}, { timestamps: true, collection: 'warehouse_exceptions' });

module.exports = mongoose.models.WarehouseException || mongoose.model('WarehouseException', WarehouseExceptionSchema);

