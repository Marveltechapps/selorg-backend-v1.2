const mongoose = require('mongoose');

const PickerShiftSlotSchema = new mongoose.Schema(
  {
    storeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Store', required: true, index: true },
    type: { type: String, required: true, trim: true, index: true }, // morning | evening | night
    startTime: { type: String, required: true, trim: true }, // "HH:mm"
    endTime: { type: String, required: true, trim: true }, // "HH:mm"
    geofenceRadiusMeters: { type: Number, default: 150 },
    gracePeriodMinutes: { type: Number, default: 10 },
    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true, collection: 'picker_shift_slots' }
);

PickerShiftSlotSchema.index({ storeId: 1, type: 1, startTime: 1, endTime: 1 });

module.exports = mongoose.models.PickerShiftSlot || mongoose.model('PickerShiftSlot', PickerShiftSlotSchema);

