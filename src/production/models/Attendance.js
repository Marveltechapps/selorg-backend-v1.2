const mongoose = require('mongoose');

const attendanceSchema = new mongoose.Schema(
  {
    record_id: {
      type: String,
      required: true,
      unique: true,
    },
    staff_id: {
      type: String,
      required: true,
    },
    date: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      required: true,
      enum: ['present', 'absent', 'late', 'on-leave'],
      default: 'absent',
    },
    check_in: { type: String },
    check_out: { type: String },
    hours_worked: { type: Number },
    store_id: {
      type: String,
      required: false,
    },
  },
  { timestamps: true }
);

attendanceSchema.index({ store_id: 1, date: -1 });
attendanceSchema.index({ staff_id: 1, date: 1 }, { unique: true });

module.exports = mongoose.models.Attendance || mongoose.model('Attendance', attendanceSchema);
