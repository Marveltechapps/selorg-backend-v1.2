const mongoose = require('mongoose');

const WarehouseShiftSlotSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true, index: true },
  date: { type: Date, required: true, index: true },
  shift: { type: String, enum: ['morning', 'afternoon', 'night'], default: 'morning' },
  requiredStaff: { type: Number, default: 4 },
  assignedStaff: [{ type: String }],
}, { timestamps: true, collection: 'warehouse_shift_slots' });

WarehouseShiftSlotSchema.index({ date: 1, shift: 1 });

module.exports = mongoose.models.WarehouseShiftSlot || mongoose.model('WarehouseShiftSlot', WarehouseShiftSlotSchema);
