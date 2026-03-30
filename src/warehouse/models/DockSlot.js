const mongoose = require('mongoose');

const DockSlotSchema = new mongoose.Schema({
  warehouseKey: { type: String, trim: true, index: true },
  id: { type: String, required: true, index: true },
  name: { type: String, required: true },
  status: { type: String, enum: ['active', 'empty', 'offline'], default: 'empty' },
  truck: { type: String },
  vendor: { type: String },
  eta: { type: String }
}, { timestamps: true, collection: 'warehouse_dock_slots' });

DockSlotSchema.index({ warehouseKey: 1, id: 1 }, { unique: true });

module.exports = mongoose.models.DockSlot || mongoose.model('DockSlot', DockSlotSchema);

