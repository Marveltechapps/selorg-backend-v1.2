const mongoose = require('mongoose');

const GRNSchema = new mongoose.Schema({
  warehouseKey: { type: String, trim: true, index: true },
  id: { type: String, required: true, index: true },
  poNumber: { type: String, required: true },
  vendor: { type: String, required: true },
  status: { type: String, enum: ['pending', 'in-progress', 'discrepancy', 'completed'], default: 'pending' },
  items: { type: Number, default: 0 },
  timestamp: { type: Date, default: Date.now },
  discrepancyNotes: { type: String },
  discrepancyType: { type: String },
  vendorPOId: { type: mongoose.Schema.Types.ObjectId, ref: 'PurchaseOrder', index: true },
}, { timestamps: true, collection: 'warehouse_grns' });

GRNSchema.index({ warehouseKey: 1, id: 1 }, { unique: true });

module.exports = mongoose.models.GRN || mongoose.model('GRN', GRNSchema);

