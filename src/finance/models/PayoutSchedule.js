const mongoose = require('mongoose');

const PayoutScheduleSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      trim: true,
    },
    vendorTier: {
      type: String,
      enum: ['platinum', 'gold', 'silver', 'bronze'],
      required: true,
    },
    cycle: {
      type: String,
      enum: ['daily', 'weekly', 'bi-weekly', 'monthly'],
      default: 'weekly',
    },
    processingDay: {
      type: String,
      default: 'Monday',
      trim: true,
    },
    minPayout: {
      type: Number,
      default: 0,
      min: 0,
    },
    maxPayout: {
      type: Number,
      default: 0,
      min: 0,
    },
    autoApprove: {
      type: Boolean,
      default: false,
    },
    autoApproveThreshold: {
      type: Number,
      default: 0,
      min: 0,
    },
    frequency: {
      type: String,
      enum: ['daily', 'weekly', 'biweekly', 'monthly'],
    },
    dayOfWeek: { type: Number, min: 0, max: 6 },
    dayOfMonth: { type: Number, min: 1, max: 31 },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

PayoutScheduleSchema.index({ vendorTier: 1 });
PayoutScheduleSchema.index({ isActive: 1 });

module.exports = mongoose.models.PayoutSchedule || mongoose.model('PayoutSchedule', PayoutScheduleSchema);

