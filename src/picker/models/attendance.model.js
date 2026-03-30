/**
 * Attendance model – from backend-workflow.yaml (attendance collection).
 * Extended for Live Attendance: breaks, lateByMinutes, overtimeMinutes, totalWorkedMinutes, status.
 */
const mongoose = require('mongoose');

const ATTENDANCE_STATUS = [
  'present',
  'half-day',
  'absent',
  'ON_DUTY',   // punched in, working
  'COMPLETED', // punched out, shift ended
  'ON_BREAK',  // on break
];

const attendanceSchema = new mongoose.Schema(
  {
    warehouseKey: { type: String, trim: true, index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    punchIn: { type: Date, required: true },
    punchOut: { type: Date },
    locationIn: { type: mongoose.Schema.Types.Mixed },
    locationOut: { type: mongoose.Schema.Types.Mixed },
    shiftId: { type: String },
    /** @deprecated Use status below. Kept for backward compat. */
    status: { type: String, enum: ATTENDANCE_STATUS, default: 'present' },
    /** Breaks during the shift: [{ startTime, endTime }] */
    breaks: [
      {
        startTime: { type: Date, required: true },
        endTime: { type: Date },
      },
    ],
    /** Minutes late (punch-in after shift start + lateTolerance) */
    lateByMinutes: { type: Number, default: 0 },
    /** Overtime minutes (work beyond shift end + overtimeGrace) */
    overtimeMinutes: { type: Number, default: 0 },
    /** Total worked minutes (excludes break time) */
    totalWorkedMinutes: { type: Number, default: 0 },
    ordersCompleted: { type: Number },
    regularHours: { type: Number },
    overtimeHours: { type: Number },
  },
  { timestamps: true }
);

attendanceSchema.index({ userId: 1, punchIn: -1 });
attendanceSchema.index({ warehouseKey: 1, punchIn: -1 });

// Use PickerAttendance to avoid conflict with production/models/Attendance.js
// Use collection 'picker_attendance' to keep picker data separate from production attendance
module.exports = mongoose.models.PickerAttendance || mongoose.model('PickerAttendance', attendanceSchema, 'picker_attendance');
