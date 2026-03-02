const mongoose = require('mongoose');

const staffPerformanceSchema = new mongoose.Schema(
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
    rank: {
      type: Number,
      required: true,
    },
    productivity: {
      type: String,
      required: true,
    },
    error_rate: {
      type: String,
      required: true,
    },
    sla_impact: {
      type: String,
      required: true,
    },
    incentive_status: {
      type: String,
      required: true,
    },
    score: {
      type: Number,
      required: true,
    },
    period: {
      type: String,
      required: true,
      enum: ['today', 'week', 'month'],
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

staffPerformanceSchema.index({ store_id: 1, period: 1, rank: 1 });
staffPerformanceSchema.index({ staff_id: 1, period: 1 });

module.exports = mongoose.models.StaffPerformance || mongoose.model('StaffPerformance', staffPerformanceSchema);

