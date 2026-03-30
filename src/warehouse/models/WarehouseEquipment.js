const mongoose = require('mongoose');

const WarehouseEquipmentSchema = new mongoose.Schema({
  warehouseKey: { type: String, trim: true, index: true },
  id: { type: String, required: true, index: true },
  name: { type: String, required: true },
  type: { type: String, enum: ['forklift', 'hsd-device', 'pallet-jack', 'crane', 'conveyor', 'other'], default: 'forklift' },
  serialNumber: { type: String },
  status: { type: String, enum: ['active', 'maintenance', 'offline', 'broken', 'idle'], default: 'active' },
  lastMaintenance: { type: Date },
  nextMaintenance: { type: Date },
  assignedTo: { type: String }, // Staff ID
  operator: { type: String },
  zone: { type: String },
  issue: { type: String },
  batteryLevel: { type: Number, min: 0, max: 100 },
  location: { type: String }
}, { timestamps: true, collection: 'warehouse_equipment' });

WarehouseEquipmentSchema.index({ warehouseKey: 1, id: 1 }, { unique: true });
WarehouseEquipmentSchema.index({ warehouseKey: 1, serialNumber: 1 }, { unique: true, sparse: true });

module.exports = mongoose.models.WarehouseEquipment || mongoose.model('WarehouseEquipment', WarehouseEquipmentSchema);

