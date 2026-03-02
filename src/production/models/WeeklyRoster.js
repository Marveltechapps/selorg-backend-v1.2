const mongoose = require('mongoose');

const weeklyRosterSchema = new mongoose.Schema(
  {
    staff_id: {
      type: String,
      required: true,
    },
    week: {
      type: Number,
      required: true,
    },
    year: {
      type: Number,
      required: true,
    },
    monday: {
      type: String,
      required: true,
    },
    tuesday: {
      type: String,
      required: true,
    },
    wednesday: {
      type: String,
      required: true,
    },
    thursday: {
      type: String,
      required: true,
    },
    friday: {
      type: String,
      required: true,
    },
    saturday: {
      type: String,
      required: true,
    },
    sunday: {
      type: String,
      required: true,
    },
    published_at: {
      type: Date,
      required: false,
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

weeklyRosterSchema.index({ store_id: 1, week: 1, year: 1 });
weeklyRosterSchema.index({ staff_id: 1, week: 1, year: 1 });

module.exports = mongoose.models.WeeklyRoster || mongoose.model('WeeklyRoster', weeklyRosterSchema);

