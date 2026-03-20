const mongoose = require('mongoose');

const RiderShiftAssignmentSchema = new mongoose.Schema(
  {
    shiftId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'RiderShift',
      required: true,
      index: true,
    },
    riderId: {
      type: String,
      required: true,
      index: true,
    },
    date: {
      type: Date,
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ['selected', 'started', 'completed', 'cancelled'],
      default: 'selected',
      index: true,
    },
    startedAt: {
      type: Date,
      default: null,
    },
    endedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    collection: 'rider_shift_assignments',
  }
);

RiderShiftAssignmentSchema.index({ riderId: 1, date: 1 });
RiderShiftAssignmentSchema.index({ shiftId: 1, status: 1 });

module.exports =
  mongoose.models.RiderShiftAssignment ||
  mongoose.model('RiderShiftAssignment', RiderShiftAssignmentSchema);

