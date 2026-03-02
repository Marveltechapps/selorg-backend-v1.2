const mongoose = require('mongoose');

const employeeOfWeekSchema = new mongoose.Schema(
  {
    staff_id: {
      type: String,
      required: true,
    },
    name: {
      type: String,
      required: true,
    },
    role: {
      type: String,
      required: true,
    },
    productivity: {
      type: String,
      required: true,
    },
    accuracy: {
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
    store_id: {
      type: String,
      required: false,
    },
  },
  {
    timestamps: true,
  }
);

employeeOfWeekSchema.index({ store_id: 1, week: 1, year: 1 });
employeeOfWeekSchema.index({ staff_id: 1, week: 1, year: 1 });

module.exports = mongoose.models.EmployeeOfWeek || mongoose.model('EmployeeOfWeek', employeeOfWeekSchema);

