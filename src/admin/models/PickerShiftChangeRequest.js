const mongoose = require('mongoose');

const PickerShiftChangeRequestSchema = new mongoose.Schema(
  {
    pickerId: { type: mongoose.Schema.Types.ObjectId, ref: 'PickerUser', required: true, index: true },
    currentShiftSlotId: { type: mongoose.Schema.Types.ObjectId, ref: 'PickerShiftSlot', default: null },
    requestedShiftSlotId: { type: mongoose.Schema.Types.ObjectId, ref: 'PickerShiftSlot', default: null },
    reason: { type: String, default: '' },
    status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending', index: true },
    decisionReason: { type: String, default: '' },
    decidedBy: { type: mongoose.Schema.Types.ObjectId, default: null },
    decidedAt: { type: Date, default: null },
  },
  { timestamps: true, collection: 'picker_shift_change_requests' }
);

PickerShiftChangeRequestSchema.index({ status: 1, createdAt: -1 });

module.exports =
  mongoose.models.PickerShiftChangeRequest ||
  mongoose.model('PickerShiftChangeRequest', PickerShiftChangeRequestSchema);

