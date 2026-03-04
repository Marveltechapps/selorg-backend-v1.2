/**
 * Shift Assignment model – links pickers to shifts for specific dates.
 * Used by Shift Roster and POST /shifts/:id/assign.
 */
const mongoose = require('mongoose');
const { SHIFT_STATUS } = require('../../constants/pickerEnums');

const shiftAssignmentSchema = new mongoose.Schema(
  {
    shiftId: { type: mongoose.Schema.Types.ObjectId, ref: 'PickerShift', required: true },
    pickerId: { type: mongoose.Schema.Types.ObjectId, ref: 'PickerUser', required: true },
    date: { type: Date, required: true },
    status: { type: String, enum: Object.values(SHIFT_STATUS), default: SHIFT_STATUS.SCHEDULED },
  },
  { timestamps: true, collection: 'picker_shift_assignments' }
);

shiftAssignmentSchema.index({ shiftId: 1, date: 1 });
shiftAssignmentSchema.index({ pickerId: 1, date: 1 });
shiftAssignmentSchema.index({ date: 1 });

module.exports = mongoose.models.PickerShiftAssignment || mongoose.model('PickerShiftAssignment', shiftAssignmentSchema);
