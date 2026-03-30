/**
 * Shift model – Picker Shift Master (dashboard-managed shift templates).
 * Used by picker app for /shifts/available and by dashboard for Shift Master CRUD.
 * Uses SHIFT_STATUS from constants/pickerEnums.js.
 */
const mongoose = require('mongoose');
const { SHIFT_STATUS } = require('../../constants/pickerEnums');

const shiftSchema = new mongoose.Schema(
  {
    id: { type: String },
    name: { type: String, required: true },
    warehouseKey: { type: String, trim: true, index: true },
    site: { type: String },
    siteId: { type: String },
    startTime: { type: String },
    endTime: { type: String },
    time: { type: String },
    duration: { type: String },
    capacity: { type: Number, default: 1 },
    breakDuration: { type: Number, default: 0 },
    status: { type: String, enum: Object.values(SHIFT_STATUS), default: SHIFT_STATUS.SCHEDULED },
    orders: { type: Number },
    basePay: { type: Number },
    color: { type: String },
    locationType: { type: String },
  },
  { timestamps: true, collection: 'picker_shifts' }
);

shiftSchema.index({ warehouseKey: 1, site: 1, status: 1 });
shiftSchema.index({ warehouseKey: 1, siteId: 1, status: 1 });

module.exports = mongoose.models.PickerShift || mongoose.model('PickerShift', shiftSchema);
