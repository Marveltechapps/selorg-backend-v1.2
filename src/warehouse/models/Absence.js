const mongoose = require('mongoose');

const AbsenceSchema = new mongoose.Schema({
  id: {
    type: String,
    required: true,
    unique: true,
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
  role: {
    type: String,
    required: true,
    trim: true,
  },
  reason: {
    type: String,
    required: true,
    trim: true,
  },
  type: {
    type: String,
    required: true,
    enum: ['Planned', 'Unplanned'],
    index: true,
  },
  date: {
    type: Date,
    required: true,
    index: true,
  },
}, {
  timestamps: true,
  collection: 'absences',
});

AbsenceSchema.index({ staffId: 1, date: 1 });
AbsenceSchema.index({ date: 1, type: 1 });


module.exports = Absence;

