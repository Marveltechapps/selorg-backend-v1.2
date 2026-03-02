const mongoose = require('mongoose');

const absenceSchema = new mongoose.Schema(
  {
    absence_id: {
      type: String,
      required: true,
      unique: true,
    },
    staff_id: {
      type: String,
      required: true,
    },
    reason: {
      type: String,
      required: true,
    },
    type: {
      type: String,
      required: true,
      enum: ['Planned', 'Unplanned'],
    },
    date: {
      type: Date,
      required: true,
    },
    notes: {
      type: String,
      required: false,
    },
    store_id: {
      type: String,
      required: false,
    },
  },
  {
    timestamps: true,
  }
);

absenceSchema.index({ store_id: 1, date: -1 });
absenceSchema.index({ staff_id: 1, date: -1 });
absenceSchema.index({ absence_id: 1 });

module.exports = mongoose.models.Absence || mongoose.model('Absence', absenceSchema);

