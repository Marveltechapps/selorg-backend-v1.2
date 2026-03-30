const mongoose = require('mongoose');

const ShiftSchema = new mongoose.Schema({
  warehouseKey: { type: String, trim: true, index: true },
  id: {
    type: String,
    required: true,
    index: true,
  },
  staffId: {
    type: String,
    required: true,
    index: true,
  },
  staffName: {
    type: String,
    required: true,
    trim: true,
  },
  date: {
    type: Date,
    required: true,
    index: true,
  },
  startTime: {
    type: String,
    required: true,
  },
  endTime: {
    type: String,
    required: true,
  },
  status: {
    type: String,
    required: true,
    enum: ['scheduled', 'active', 'completed', 'absent', 'late'],
    default: 'scheduled',
    index: true,
  },
  checkInTime: {
    type: String,
    default: null,
  },
  checkOutTime: {
    type: String,
    default: null,
  },
  hub: {
    type: String,
    required: true,
    trim: true,
  },
  isPeakHour: {
    type: Boolean,
    default: false,
  },
  overtimeMinutes: {
    type: Number,
    default: 0,
  },
}, {
  timestamps: true,
  collection: 'shifts',
});

ShiftSchema.index({ warehouseKey: 1, id: 1 }, { unique: true });

ShiftSchema.index({ staffId: 1, date: 1 });
ShiftSchema.index({ date: 1, status: 1 });
ShiftSchema.index({ hub: 1, date: 1 });


module.exports = mongoose.models.Shift || mongoose.model('Shift', ShiftSchema);

