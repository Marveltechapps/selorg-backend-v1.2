/**
 * Picker Workforce Device model – HHD/device inventory for picker assignment.
 * Uses DEVICE_STATUS from pickerEnums (AVAILABLE, ASSIGNED, REPAIR, LOST).
 * Collection: picker_devices
 */
const mongoose = require('mongoose');
const { DEVICE_STATUS } = require('../../constants/pickerEnums');

const deviceSchema = new mongoose.Schema(
  {
    warehouseKey: { type: String, trim: true, index: true },
    deviceId: { type: String, required: true },
    serial: { type: String },
    status: { type: String, enum: Object.values(DEVICE_STATUS), default: DEVICE_STATUS.AVAILABLE },
    assignedPickerId: { type: mongoose.Schema.Types.ObjectId, ref: 'PickerUser', default: null },
    assignedAt: { type: Date, default: null },
    returnedAt: { type: Date, default: null },
    condition: { type: String },
    conditionNotes: { type: String },
    conditionPhotoUrl: { type: String },
    lastReturnedAt: { type: Date, default: null },
  },
  { timestamps: true, collection: 'picker_devices' }
);

deviceSchema.index({ status: 1 });
deviceSchema.index({ assignedPickerId: 1 });
deviceSchema.index({ deviceId: 'text', serial: 'text' });
deviceSchema.index({ warehouseKey: 1, deviceId: 1 }, { unique: true });

module.exports = mongoose.model('PickerDevice', deviceSchema);
