const mongoose = require('mongoose');

const InterWarehouseTransferSchema = new mongoose.Schema({
  warehouseKey: { type: String, trim: true, index: true },
  id: { type: String, required: true, index: true },
  origin: { type: String, default: 'Current Warehouse' },
  destination: { type: String, required: true },
  status: { type: String, enum: ['pending', 'loading', 'en-route', 'completed', 'cancelled'], default: 'pending' },
  items: { type: Number, required: true },
  vehicleId: { type: String },
  distance: { type: String },
  eta: { type: String },
  progress: { type: Number, min: 0, max: 100, default: 0 },
  requestedBy: { type: String },
  requestedAt: { type: Date, default: Date.now }
}, { timestamps: true, collection: 'warehouse_inter_transfers' });

InterWarehouseTransferSchema.index({ warehouseKey: 1, id: 1 }, { unique: true });

module.exports = mongoose.models.InterWarehouseTransfer || mongoose.model('InterWarehouseTransfer', InterWarehouseTransferSchema);

