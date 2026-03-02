const mongoose = require('mongoose');

const WarehouseEquipmentSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true, index: true },
  name: { type: String, required: true },
  type: { type: String, enum: ['forklift', 'hsd-device', 'pallet-jack', 'crane', 'conveyor', 'other'], default: 'forklift' },
  serialNumber: { type: String, unique: true },
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

module.exports = mongoose.models.WarehouseEquipment || mongoose.model('WarehouseEquipment', WarehouseEquipmentSchema);

