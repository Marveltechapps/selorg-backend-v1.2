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
  dockId: { type: String, trim: true, index: true },
}, { timestamps: true, collection: 'warehouse_grns' });

GRNSchema.index({ warehouseKey: 1, id: 1 }, { unique: true });

// Must not use model name 'GRN' — darkstore/vendor/production also register 'GRN' with different schemas.
module.exports =
  mongoose.models.WarehouseGRN || mongoose.model('WarehouseGRN', GRNSchema, 'warehouse_grns');

